"use client";

import { useState } from "react";

const copyStyle =
  "bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300";

export function CopyButton({ text, label = "Copy", className = copyStyle }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** A snippet the seller pastes somewhere, with its own copy button. */
export function Snippet({ code }: { code: string }) {
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-stone-100 p-3 pr-20 font-mono text-xs leading-relaxed dark:bg-stone-900">{code}</pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; tools: number; ms: number }
  | { kind: "error"; message: string };

/** Talk to the shop's MCP server the way an assistant would (tools/list) and report back. */
export function ConnectionTest({ mcpUrl }: { mcpUrl: string }) {
  const [state, setState] = useState<TestState>({ kind: "idle" });

  async function test() {
    setState({ kind: "testing" });
    const started = performance.now();
    try {
      const res = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const body = await res.json();
      if (!res.ok || !body.result) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      setState({ kind: "ok", tools: body.result.tools.length, ms: Math.round(performance.now() - started) });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={test}
        disabled={state.kind === "testing"}
        className="rounded-md border border-stone-300 px-3 py-1.5 font-medium transition-colors hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-900"
      >
        {state.kind === "testing" ? "Testing…" : "Test connection"}
      </button>
      {state.kind === "ok" && (
        <span role="status" className="text-emerald-700 dark:text-emerald-400">
          Connected. {state.tools} tools ready ({state.ms} ms).
        </span>
      )}
      {state.kind === "error" && (
        <span role="status" className="text-red-700 dark:text-red-400">
          Couldn&apos;t reach your shop: {state.message}
        </span>
      )}
    </div>
  );
}

export type SetupGuide = { id: string; name: string; steps: string[]; snippet?: string; note?: string };

export function SetupTabs({ guides }: { guides: SetupGuide[] }) {
  const [active, setActive] = useState(guides[0].id);
  const guide = guides.find((g) => g.id === active) ?? guides[0];
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-800">
        {guides.map((g) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            aria-selected={g.id === active}
            onClick={() => setActive(g.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              g.id === active
                ? "border-stone-900 dark:border-stone-100"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.snippet && <Snippet code={guide.snippet} />}
        {guide.note && <p className="mt-3 text-sm opacity-60">{guide.note}</p>}
      </div>
    </div>
  );
}
