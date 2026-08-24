import { NextRequest, NextResponse } from "next/server";
import {
  execGetDashboardStats,
  execGetBins,
  execGetAlerts,
  execGetTelemetry,
  execGetCustomers,
  execGetCompartments,
} from "@/lib/chat/tools";

const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const SYSTEM_PROMPT = `You are Sortyx AI, a friendly and knowledgeable assistant for the Sortyx smart waste management platform — like ChatGPT, but specialized for this product.

Below the conversation you will be given a DATA CONTEXT containing real, live information pulled from the Sortyx database (bins, alerts, customers, etc.).

Rules:
- Answer in a natural, conversational, helpful tone — like ChatGPT would.
- Base every factual claim on the DATA CONTEXT. Never invent numbers or bins that aren't in the context.
- Respond ONLY to what the user asked. Be short, simple and direct — no extra preamble, no summaries unless asked.
- Never output <think> tags or show your reasoning. Just give the final answer.
- If the context has the information, give a clear, specific answer. Use markdown tables or bullet lists when listing multiple items.
- If the context does NOT contain what the user asked for, say you couldn't find it in the current data and suggest what they could ask instead.
- Use bold for key numbers when helpful.
- Today's date is ${new Date().toISOString().split("T")[0]}.`;

type ToolResponse = { summary: string; result: unknown };

function extractDeviceId(text: string): string | null {
  const m = text.match(/\b(bin[-_]?[a-z0-9]{2,}|[a-z]{2,}-\d{3,}|\d{4,})\b/i);
  return m ? m[1] : null;
}

async function retrieveContext(question: string): Promise<string> {
  const q = question.toLowerCase();
  const blocks: string[] = [];

  const add = async (label: string, fn: () => Promise<ToolResponse>) => {
    try {
      const r = await fn();
      blocks.push(
        `### ${label}\n${r.summary}\n\`\`\`json\n${JSON.stringify(r.result, null, 2)}\n\`\`\``,
      );
    } catch (e) {
      blocks.push(`### ${label}\n(error retrieving data)`);
    }
  };

  await add("Dashboard Overview", execGetDashboardStats);

  if (/(alert|critical|warning|criti|issue|problem)/.test(q)) {
    await add("Critical Alerts", () =>
      execGetAlerts({ severity: "critical", resolved: false, limit: 25 }),
    );
    await add("Unresolved Alerts", () => execGetAlerts({ resolved: false, limit: 25 }));
  }

  if (/(bin|full|fill|offline|maintenance|status|level)/.test(q)) {
    await add("Bins", () => execGetBins({}));
  }

  if (/(customer|client|account)/.test(q)) {
    await add("Customers", execGetCustomers);
  }

  const deviceId = extractDeviceId(question);
  if (/(compartment|section|slot)/.test(q) && deviceId) {
    await add(`Compartments (${deviceId})`, () => execGetCompartments({ bin_device_id: deviceId }));
  }
  if (/(telemetry|history|sensor|reading|trend)/.test(q) && deviceId) {
    await add(`Telemetry (${deviceId})`, () =>
      execGetTelemetry({ bin_device_id: deviceId, limit: 20 }),
    );
  }

  return blocks.join("\n\n");
}

function buildPrompt(messages: { role: string; content: string }[], context: string) {
  const conversation = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return `${SYSTEM_PROMPT}

=== DATA CONTEXT (real Sortyx data — use this to answer) ===
${context}
=== END DATA CONTEXT ===

Conversation:
${conversation}
Assistant:`;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_KEY) {
      return NextResponse.json({ error: "Cloudflare AI not configured" }, { status: 500 });
    }

    const body = await request.json();
    const messages: { role: string; content: string }[] = body.messages ?? [];
    if (!messages.length) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = lastUser?.content ?? "";

    const context = await retrieveContext(question);
    const prompt = buildPrompt(messages, context);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cloudflare AI error (${res.status}): ${err}`);
    }

    const data = await res.json();
    let content: string =
      data?.result?.response ?? data?.response ?? "Sorry, I couldn't process that.";

    content = content
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^\s*think\s*$/i, "")
      .trim();

    return NextResponse.json({ message: { role: "assistant", content } });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
