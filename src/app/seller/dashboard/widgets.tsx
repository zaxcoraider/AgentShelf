"use client";

import type { AgWidgetApi, AgWidgetField, AgWidgetParams } from "ag-studio";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * AgentShelf's custom AG Studio widgets. Both read through Studio's own data engine
 * (widgetApi.getData), so page filters, cross filters and the relationships between tables
 * apply to them exactly as they do to the built-in charts.
 *
 *  - Dispute countdown: every open PayPal dispute, soonest deadline first, ticking live.
 *  - Agent feed: what the PayPal seller agent just did, did on its own, queued, or was blocked from.
 */

type Row = Record<string, unknown>;

/** Look fields up by "table.field" id in the report schema, so a query needs no data mapping. */
function schemaFields(api: AgWidgetApi, ids: string[]): AgWidgetField[] | null {
  const all = new Map(api.getSchema().flatMap((t) => t.fields.map((f) => [f.fieldId as string, f] as const)));
  const fields = ids.map((id) => all.get(id));
  return fields.every(Boolean) ? (fields as AgWidgetField[]) : null;
}

/** Query the given fields; rows come back keyed by our short names. Re-runs when Studio re-renders the widget. */
function useRows(params: AgWidgetParams, ids: Record<string, string>, accept: (row: Row) => boolean = () => true) {
  const { widgetApi } = params;
  const [rows, setRows] = useState<Row[] | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const names = Object.keys(ids);
      const fields = schemaFields(widgetApi, Object.values(ids));
      if (!fields) {
        widgetApi.setDisplayState("noData");
        return;
      }
      widgetApi.setDisplayState("loading", { prominent: !loaded.current });
      const response = await widgetApi.getData({ fields });
      if (cancelled) return;
      const out = response.results.rows
        .map((r) => Object.fromEntries(names.map((n, i) => [n, r[fields[i].key]])))
        .filter(accept);
      loaded.current = true;
      setRows(out);
      // We draw our own empty states, which say more than "No data to display".
      widgetApi.setDisplayState("displayed");
    })().catch(() => !cancelled && widgetApi.setDisplayState("noData"));
    return () => {
      cancelled = true;
    };
    // Studio hands the widget fresh params whenever filters or data change; that is our cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return rows;
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const usd = (n: unknown) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null;

function Header({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2 pt-2 pb-3">
      <h3 className="text-2xl leading-tight text-cream">{title}</h3>
      {aside}
    </div>
  );
}

// ---------- Dispute countdown ----------

// PayPal gives sellers 10 days to respond; the bar shows how much of that window is left.
const RESPONSE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

function countdown(ms: number) {
  if (ms <= 0) return { text: "Overdue", parts: [] as [number, string][] };
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: [number, string][] = d ? [[d, "d"], [h, "h"], [m, "m"]] : [[h, "h"], [m, "m"], [s % 60, "s"]];
  return { text: "", parts };
}

export function DisputeCountdown(params: AgWidgetParams) {
  const rows = useRows(
    params,
    {
      reason: "disputes.reason",
      status: "disputes.status",
      amount: "disputes.amount",
      dueAt: "disputes.dueAt",
      recommendation: "disputes.recommendation",
      buyer: "orders.buyer",
    },
    (r) => r.status === "Open",
  );
  const now = useNow(1000);
  const open = (rows ?? [])
    .map((r): Row & { due: number } => ({ ...r, due: r.dueAt ? time(r.dueAt) : Infinity }))
    .sort((a, b) => a.due - b.due);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="PayPal disputes"
        aside={
          rows && (
            <span className="text-xs text-smoke">{open.length ? "Soonest deadline first" : "Nothing to answer"}</span>
          )
        }
      />
      {rows && !open.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-6 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
            </svg>
          </span>
          <p className="text-sm text-cream">No open disputes</p>
          <p className="max-w-56 text-xs text-smoke">When a buyer opens one in PayPal, its response deadline counts down here.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
          {open.map((d, i) => {
            const left = d.due - now;
            const { text, parts } = countdown(left);
            const urgent = left < 24 * 3600 * 1000;
            const soon = left < 72 * 3600 * 1000;
            const tone = urgent ? "text-red-400" : soon ? "text-amber-400" : "text-cream";
            const bar = urgent ? "bg-red-400" : soon ? "bg-amber-400" : "bg-amber-200/70";
            const pct = Math.max(2, Math.min(100, (left / RESPONSE_WINDOW_MS) * 100));
            return (
              <li key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cream">{String(d.reason ?? "Buyer opened a dispute")}</p>
                    <p className="truncate text-xs text-smoke">
                      {[d.buyer, usd(d.amount)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className={`shrink-0 font-mono text-lg leading-none tabular-nums ${tone}`} aria-label="Time left to respond">
                    {text ||
                      parts.map(([n, u]) => (
                        <span key={u}>
                          {String(n).padStart(2, "0")}
                          <span className="mr-1 text-xs opacity-60">{u}</span>
                        </span>
                      ))}
                  </p>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${bar} transition-[width] duration-1000`} style={{ width: `${pct}%` }} />
                </div>
                {d.recommendation ? (
                  <p className="mt-2 line-clamp-2 text-xs text-smoke">
                    <span className="text-amber-300/90">Agent: </span>
                    {String(d.recommendation)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Agent feed ----------

const OUTCOME_STYLE: Record<string, string> = {
  "Done by agent": "bg-emerald-500/15 text-emerald-300",
  Approved: "bg-emerald-500/10 text-emerald-200",
  "Needs you": "bg-amber-500/20 text-amber-300",
  "Blocked by rule": "bg-red-500/15 text-red-300",
  Rejected: "bg-stone-500/20 text-stone-300",
  Failed: "bg-red-500/20 text-red-300",
};

// Studio hands dateTime values back as Date objects (or numbers), not the ISO strings we sent.
const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(String(v)).getTime());

function ago(at: unknown, now: number) {
  const mins = Math.round((now - time(at)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const FEED_SIZE = 12;

export function AgentFeed(params: AgWidgetParams) {
  const rows = useRows(params, {
    at: "agentActions.at",
    action: "agentActions.action",
    outcome: "agentActions.outcome",
    amount: "agentActions.amount",
    reason: "agentActions.reason",
  });
  const now = useNow(30_000);
  const reduce = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  const items = (rows ?? [])
    .map((r): Row & { id: string } => ({ ...r, id: `${time(r.at)}|${r.action}|${r.outcome}` }))
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, FEED_SIZE);
  // Rows that weren't there last render are new: they slide in. The first load doesn't animate.
  const fresh = new Set(seen.current ? items.filter((i) => !seen.current!.has(i.id)).map((i) => i.id) : []);
  useEffect(() => {
    if (rows) seen.current = new Set(items.map((i) => i.id));
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Seller agent, live"
        aside={
          <span className="inline-flex items-center gap-1.5 text-xs text-smoke">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        }
      />
      {rows && !items.length ? (
        <p className="flex flex-1 items-center justify-center px-6 pb-6 text-center text-sm text-smoke">
          Nothing yet. Refunds, tracking and dispute reviews show up here as the agent works.
        </p>
      ) : (
        <ol className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <span aria-hidden className="absolute top-2 bottom-3 left-[0.8rem] w-px bg-white/[0.07]" />
          <AnimatePresence initial={false}>
            {items.map((a) => (
              <motion.li
                key={a.id}
                layout={!reduce}
                initial={fresh.has(a.id) && !reduce ? { opacity: 0, y: -12, backgroundColor: "rgba(245,158,11,0.18)" } : false}
                animate={{ opacity: 1, y: 0, backgroundColor: "rgba(245,158,11,0)" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative flex gap-3 rounded-lg py-2 pr-1 pl-0"
              >
                <span
                  aria-hidden
                  className={`relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-[#17130f] ${
                    a.outcome === "Blocked by rule" || a.outcome === "Failed"
                      ? "bg-red-400"
                      : a.outcome === "Needs you"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                  style={{ marginLeft: "0.15rem" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm text-cream">
                      {String(a.action)}
                      {usd(a.amount) ? <span className="text-smoke"> · {usd(a.amount)}</span> : null}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] ${OUTCOME_STYLE[String(a.outcome)] ?? "bg-white/10 text-cream"}`}>
                      {String(a.outcome)}
                    </span>
                    <span className="ml-auto text-xs text-smoke tabular-nums">{ago(a.at, now)}</span>
                  </div>
                  {a.reason ? <p className="mt-0.5 line-clamp-2 text-xs text-smoke">{String(a.reason)}</p> : null}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

// ---------- Definitions for createWidgets ----------

const icon = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="${path}"/></svg>`;

// No fields to map (the widgets read fixed tables), so the edit form is Studio's standard
// widget-type picker and title sections with an empty data mapping.
const form = (params: { createDefaults: (p: { dataMappingItems: never[] }) => unknown }) =>
  params.createDefaults({ dataMappingItems: [] });

export const CUSTOM_WIDGETS = [
  {
    id: "dispute-countdown",
    label: "Dispute countdown",
    icon: icon("M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.75 4v3.69l2.78 2.78-1.06 1.06-3.22-3.22V6h1.5z"),
    comp: DisputeCountdown,
    form,
    defaultSize: { width: 420, height: 360 },
    minSize: { width: 260, height: 200 },
    ai: {
      label: "Dispute countdown",
      description:
        "Live countdown to each open PayPal dispute's seller-response deadline, soonest first, with the seller agent's recommendation.",
      usage:
        "Use when the seller asks about disputes, deadlines, what's urgent, or chargebacks. Prefer it over a table or KPI of disputes: it ticks live and turns amber under 3 days, red under 1.",
      configuration:
        "Needs no data mapping and no format: it always reads the Disputes table, and page filters apply to it. Add it and leave dataMapping empty ({}). A tall slot, about 8 columns wide and 16 rows high, suits it.",
    },
  },
  {
    id: "agent-feed",
    label: "Agent feed",
    icon: icon("M3 4h14v2H3V4zm0 5h10v2H3V9zm0 5h14v2H3v-2z"),
    comp: AgentFeed,
    form,
    defaultSize: { width: 420, height: 400 },
    minSize: { width: 280, height: 220 },
    ai: {
      label: "Seller agent feed",
      description:
        "Live feed of the PayPal seller agent's latest actions (refunds, shipment tracking, dispute reviews) with their outcome: done by agent, needs the seller, approved, or blocked by a rule, and the agent's reason.",
      usage:
        "Use when the seller asks what the agent did, wants to watch the agent work, or asks about automatic or blocked refunds. Prefer it over a grid of agent actions for a live, readable view.",
      configuration:
        "Needs no data mapping and no format: it always reads the Agent actions table, and page filters apply to it. Add it and leave dataMapping empty ({}). About 9 columns wide and 18 rows high.",
    },
  },
];
