"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Sortyx AI. Ask me anything about your bins, alerts, or customers." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        className={cn(
          "fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg transition-all duration-200",
          open && "scale-0 opacity-0"
        )}
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex w-[380px] flex-col rounded-xl border bg-background/95 backdrop-blur-xl shadow-2xl transition-all duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
        )}
        style={{ height: "520px" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">Sortyx AI</p>
              <p className="text-[10px] text-muted-foreground">Ask anything about your data</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 text-sm",
                msg?.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg?.role === "assistant" && (
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 leading-relaxed",
msg?.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 border"
                )}
              >
                <div className="prose prose-xs max-w-none dark:prose-invert [&_table]:w-full [&_table]:text-[11px] [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_code]:bg-accent [&_code]:px-1 [&_code]:rounded">
                  <Markdown content={msg.content} />
                </div>
              </div>
              {msg?.role === "user" && (
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
                  <User className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2 text-sm">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="max-w-[85%] rounded-lg border bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your bins, alerts..."
              rows={1}
              className="flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 min-h-[36px] max-h-[80px]"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground text-center">
            Powered by Cloudflare Workers AI — responses are AI-generated
          </p>
        </div>
      </div>
    </>
  );
}

function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (!inTable) {
        tableHeaders = cells;
        inTable = true;
        tableRows = [];
        i++;
        continue;
      }
      if (line.includes("---")) continue;
      tableRows.push(cells);
      continue;
    }

    if (inTable) {
      elements.push(
        <table key={`table-${i}`}>
          <thead>
            <tr>{tableHeaders.map((h, j) => <th key={j}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, j) => (
              <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="font-semibold">{line.replace(/\*\*/g, "")}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.slice(2);
      elements.push(<li key={i} className="list-disc ml-4">{inlineFormat(text)}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s/, "");
      elements.push(<li key={i} className="list-decimal ml-4">{inlineFormat(text)}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(<p key={i}>{inlineFormat(line)}</p>);
    }
  }

  if (inTable) {
    elements.push(
      <table key="table-end">
        <thead>
          <tr>{tableHeaders.map((h, j) => <th key={j}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {tableRows.map((row, j) => (
            <tr key={j}>{row.map((cell, k) => <td key={k}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <>{elements}</>;
}

function inlineFormat(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;

  const patterns: { regex: RegExp; render: (m: string) => React.ReactNode }[] = [
    { regex: /\*\*(.+?)\*\*/g, render: (m) => <strong key={m}>{m.slice(2, -2)}</strong> },
    { regex: /`(.+?)`/g, render: (m) => <code key={m} className="bg-accent px-1 rounded text-[11px]">{m.slice(1, -1)}</code> },
  ];

  let lastIndex = 0;
  const combined: { start: number; end: number; node: React.ReactNode }[] = [];

  for (const { regex, render } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      combined.push({ start: match.index, end: match.index + match[0].length, node: render(match[0]) });
    }
  }

  combined.sort((a, b) => a.start - b.start);

  for (const c of combined) {
    if (c.start > lastIndex) {
      parts.push(text.slice(lastIndex, c.start));
    }
    parts.push(c.node);
    lastIndex = c.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
