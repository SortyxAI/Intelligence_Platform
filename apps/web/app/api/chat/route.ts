import { NextRequest, NextResponse } from "next/server";
import {
  execGetDashboardStats,
  execGetBins,
  execGetAlerts,
  execGetTelemetry,
  execGetCustomers,
  execGetCompartments,
} from "@/lib/chat/tools";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

type ToolParam = {
  type: string;
  properties?: Record<string, { type: string; description: string }>;
};

const tools: Record<string, {
  description: string;
  parameters: ToolParam;
  execute: (args: Record<string, unknown>) => Promise<{ result: unknown; summary: string }>;
}> = {
  get_dashboard_stats: {
    description: "Get a quick overview dashboard summary: total bins, active/offline/maintenance counts, unresolved alerts, customer count.",
    parameters: { type: "object" },
    execute: execGetDashboardStats,
  },
  get_bins: {
    description: "Search and filter bins by status, customer name, fill level range, location, or device ID.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: active, offline, maintenance, decommissioned" },
        customer_name: { type: "string", description: "Filter by customer name (partial match)" },
        fill_min: { type: "number", description: "Minimum fill level percentage (0-100)" },
        fill_max: { type: "number", description: "Maximum fill level percentage (0-100)" },
        location: { type: "string", description: "Filter by location name (partial match)" },
        device_id: { type: "string", description: "Filter by device ID (partial match)" },
      },
    },
    execute: execGetBins,
  },
  get_alerts: {
    description: "Search and filter alerts by severity, bin device ID, date range, or resolved status.",
    parameters: {
      type: "object",
      properties: {
        severity: { type: "string", description: "Filter by severity: low, medium, high, critical" },
        bin_device_id: { type: "string", description: "Filter by bin device ID (partial match)" },
        from_date: { type: "string", description: "Start date (ISO 8601 or YYYY-MM-DD)" },
        to_date: { type: "string", description: "End date (ISO 8601 or YYYY-MM-DD)" },
        resolved: { type: "boolean", description: "true for resolved alerts, false for unresolved" },
        limit: { type: "number", description: "Maximum alerts to return (default 50)" },
      },
    },
    execute: execGetAlerts,
  },
  get_telemetry: {
    description: "Get telemetry history for a specific bin (fill level, weight, battery, sensor status over time).",
    parameters: {
      type: "object",
      properties: {
        bin_device_id: { type: "string", description: "Bin device ID to query (required)" },
        from_date: { type: "string", description: "Start date (ISO 8601 or YYYY-MM-DD)" },
        to_date: { type: "string", description: "End date (ISO 8601 or YYYY-MM-DD)" },
        limit: { type: "number", description: "Maximum records to return (default 20)" },
      },
    },
    execute: execGetTelemetry,
  },
  get_customers: {
    description: "Get all customers with their bin counts and active bin counts.",
    parameters: { type: "object" },
    execute: execGetCustomers,
  },
  get_compartments: {
    description: "Get compartment-level fill data for a specific bin.",
    parameters: {
      type: "object",
      properties: {
        bin_device_id: { type: "string", description: "Bin device ID to query compartments for (required)" },
      },
    },
    execute: execGetCompartments,
  },
};

function openAITools() {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function" as const,
    function: {
      name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

const SYSTEM_PROMPT = `You are Sortyx AI, a helpful assistant for the Sortyx smart waste management platform.

You help users understand their bin data, alerts, telemetry, and customers.

Rules:
- Answer clearly and concisely using the data you retrieve.
- When showing numbers, provide context (e.g. "3 out of 12 bins are full" rather than just "3 bins").
- If you don't have enough data to answer, say so honestly.
- If a user asks something outside the platform data, politely redirect to what you can help with.
- Format responses with markdown for readability (bold for numbers, bullet lists for multiple items).
- Always use the provided functions to get real data — never make up numbers.
- The current date is ${new Date().toISOString().split("T")[0]}.`;

async function groqFetch(messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }[]) {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: openAITools(),
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error (${res.status}): ${err}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { messages: clientMessages } = await request.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const msgs: { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    const firstUserIdx = clientMessages.findIndex((m: { role: string }) => m.role === "user");
    const relevant = firstUserIdx >= 0 ? clientMessages.slice(firstUserIdx) : [];

    for (const m of relevant) {
      msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content ?? "" });
    }

    const userMsg = msgs.pop()!;

    let data = await groqFetch([...msgs, userMsg]);
    let choice = data.choices?.[0];

    let turnCount = 0;
    while (choice?.finish_reason === "tool_calls" && turnCount < 5) {
      turnCount++;
      const toolCalls = choice.message.tool_calls ?? [];
      msgs.push(choice.message);
      msgs.push(userMsg);

      for (const tc of toolCalls) {
        const tool = tools[tc.function.name];
        if (!tool) {
          msgs.push({ role: "tool", tool_call_id: tc.id, content: `Unknown tool: ${tc.function.name}` });
          continue;
        }
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
        const { result, summary } = await tool.execute(args);
        msgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ result, summary }),
        });
      }

      data = await groqFetch(msgs);
      choice = data.choices?.[0];
    }

    const text = choice?.message?.content ?? "Sorry, I couldn't process that request.";
    return NextResponse.json({ message: { role: "assistant", content: text } });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
