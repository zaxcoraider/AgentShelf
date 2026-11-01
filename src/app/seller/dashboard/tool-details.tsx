"use client";

import type { AgAiToolDetailParams } from "ag-studio";
import type { AgAiToolDisplay } from "ag-studio-react";
import type { ReactNode } from "react";

/**
 * How the PayPal seller agent's tool calls read in AG Studio's chat panel: a one-line label for every
 * phase of the call, and a detail card that opens when the step is expanded. The data is what the
 * tool returned (see /api/seller/studio/tools and src/lib/studio-agent/tools.ts).
 */

// ---------- Result shapes (as returned by src/lib/studio-agent/tools.ts) ----------

type OrderLine = {
  ref: string;
  buyer: string;
  product: string;
  boughtVia: string;
  status: string;
  total: string;
  refunded?: string;
  placed: string;
  tracking?: string;
  origin: string;
};
type RefundRules = { autoRefundLimitPerOrder: string; dailyAutoRefundCap: string; autoRefundedToday: string; headroomToday: string };
type Briefing = {
  openDisputes: { order: OrderLine; reason: string; amount?: string; hoursLeft: number | null; overdue: boolean; agentRecommendation?: string }[];
  waitingForYourApproval: { action: string; orderRef?: string; amount?: string; agentReason: string }[];
  readyToShip: OrderLine[];
  refundRules: RefundRules;
};
type Activity = { when: string; action: string; outcome: string; orderRef?: string; amount?: string; agentReason: string }[];
type RefundCheck = { order: OrderLine; verdict: string; amount?: string; why: string; refundRules: RefundRules } | { error: string };

// ---------- Small pieces ----------

const OUTCOME: Record<string, string> = {
  "Done by agent": "bg-emerald-500/15 text-emerald-300",
  Approved: "bg-emerald-500/10 text-emerald-200",
  "Needs you": "bg-amber-500/20 text-amber-300",
  "Blocked by rule": "bg-red-500/15 text-red-300",
  Rejected: "bg-stone-500/20 text-stone-300",
  Failed: "bg-red-500/20 text-red-300",
};

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] ${className}`}>{children}</span>;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="mt-1 space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[0.8rem] leading-snug text-cream">{children}</div>;
}

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-amber-400/90">{children}</p>
      {aside && <span className="text-[0.7rem] text-smoke">{aside}</span>}
    </div>
  );
}

const timeLeft = (h: number | null) => (h == null ? "no deadline" : h < 0 ? "overdue" : h < 48 ? `${h}h left` : `${Math.round(h / 24)}d left`);

function data<T>(params: AgAiToolDetailParams): T | undefined {
  return params.result?.success ? (params.result.data as T) : undefined;
}

// ---------- Detail cards ----------

function BriefingCard(params: AgAiToolDetailParams) {
  const b = data<Briefing>(params);
  if (!b) return null;
  return (
    <Card>
      <section>
        <Heading aside={b.openDisputes.length ? "soonest first" : undefined}>PayPal disputes</Heading>
        {b.openDisputes.length ? (
          <ul className="mt-1.5 space-y-1.5">
            {b.openDisputes.map((d) => {
              const h = d.hoursLeft;
              const tone = h != null && h < 24 ? "bg-red-500/15 text-red-300" : h != null && h < 72 ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-cream";
              return (
                <li key={d.order.ref} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{d.reason}</span>
                    <span className="text-smoke">
                      {d.order.buyer} · {d.amount ?? d.order.total}
                    </span>
                  </span>
                  <Chip className={tone}>{timeLeft(h)}</Chip>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-smoke">None open.</p>
        )}
      </section>
      <section>
        <Heading>Waiting for your approval</Heading>
        {b.waitingForYourApproval.length ? (
          <ul className="mt-1.5 space-y-1">
            {b.waitingForYourApproval.map((a, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">
                  {a.action}
                  {a.orderRef ? ` · ${a.orderRef}` : ""}
                </span>
                <span className="shrink-0 text-amber-300">{a.amount}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-smoke">Nothing waiting.</p>
        )}
      </section>
      <section className="grid grid-cols-2 gap-2">
        <Stat label="Ready to ship" value={String(b.readyToShip.length)} />
        <Stat label="Auto-refund room today" value={b.refundRules.headroomToday} />
      </section>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <p className="text-[0.68rem] text-smoke">{label}</p>
      <p className="text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

function verdictOf(verdict: string) {
  if (verdict.startsWith("The seller agent would refund")) return { label: "Automatic", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20" };
  if (verdict.includes("ask you")) return { label: "Needs your approval", cls: "bg-amber-500/15 text-amber-300 ring-amber-400/20" };
  return { label: "Blocked", cls: "bg-red-500/15 text-red-300 ring-red-400/20" };
}

function RefundCard(params: AgAiToolDetailParams) {
  const r = data<RefundCheck>(params);
  if (!r) return null;
  if ("error" in r) {
    return (
      <Card>
        <p className="text-smoke">{r.error}</p>
      </Card>
    );
  }
  const v = verdictOf(r.verdict);
  return (
    <Card>
      <div className={`rounded-lg px-3 py-2.5 ring-1 ${v.cls}`}>
        <p className="text-[0.68rem] uppercase tracking-[0.12em] opacity-80">{r.amount ? `Refund of ${r.amount} would be` : "Refund would be"}</p>
        <p className="text-lg font-semibold">{v.label}</p>
        <p className="mt-0.5 text-[0.78rem] opacity-90">{r.why}</p>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate">
          {r.order.product} · {r.order.buyer}
        </span>
        <span className="shrink-0 text-smoke">
          {r.order.total} · {r.order.status}
        </span>
      </div>
      <p className="text-smoke">
        Rules: up to {r.refundRules.autoRefundLimitPerOrder} per order on its own, {r.refundRules.dailyAutoRefundCap} a day ({r.refundRules.headroomToday}{" "}
        left today). Dry run: nothing was refunded.
      </p>
    </Card>
  );
}

function ActivityCard(params: AgAiToolDetailParams) {
  const rows = data<Activity>(params);
  if (!rows) return null;
  if (!rows.length) {
    return (
      <Card>
        <p className="text-smoke">No actions match.</p>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="space-y-2">
        {rows.slice(0, 8).map((a, i) => (
          <li key={i}>
            <div className="flex items-center gap-2">
              <span className="truncate">
                {a.action}
                {a.amount ? ` · ${a.amount}` : ""}
              </span>
              <Chip className={OUTCOME[a.outcome] ?? "bg-white/10 text-cream"}>{a.outcome}</Chip>
              <span className="ml-auto shrink-0 text-[0.7rem] text-smoke">{a.when.slice(0, 10)}</span>
            </div>
            {a.agentReason && <p className="mt-0.5 line-clamp-2 text-smoke">{a.agentReason}</p>}
          </li>
        ))}
      </ul>
      {rows.length > 8 && <p className="text-[0.7rem] text-smoke">+{rows.length - 8} more</p>}
    </Card>
  );
}

function OrdersCard(params: AgAiToolDetailParams) {
  const rows = data<OrderLine[]>(params);
  if (!rows) return null;
  if (!rows.length) {
    return (
      <Card>
        <p className="text-smoke">No orders match.</p>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-white/[0.06]">
        {rows.slice(0, 6).map((o) => (
          <li key={o.ref} className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="block truncate">{o.product}</span>
              <span className="text-smoke">
                {o.buyer} · via {o.boughtVia} · <span className="font-mono">{o.ref}</span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block tabular-nums">{o.total}</span>
              <span className="text-[0.7rem] text-smoke">{o.status}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Labels + cards, keyed by tool name ----------

const pill = (d: unknown, unit: string) => (Array.isArray(d) ? `${d.length} ${unit}` : undefined);

export const aiToolDisplay: Record<string, AgAiToolDisplay> = {
  shop_briefing: {
    label: ({ result }) => {
      const b = result?.success ? (result.data as Briefing | undefined) : undefined;
      return {
        text: result ? "Checked disputes, approvals and orders to ship" : "Checking what needs you",
        pill: b ? `${b.openDisputes.length} open disputes` : undefined,
      };
    },
    detail: BriefingCard,
  },
  agent_activity: {
    label: ({ args, result }) => ({
      text: `${result ? "Read" : "Reading"} the seller agent's log${args?.outcome ? `: ${String(args.outcome)}` : ""}`,
      pill: result?.success ? pill(result.data, "actions") : undefined,
    }),
    detail: ActivityCard,
  },
  find_orders: {
    label: ({ args, result }) => ({
      text: `${result ? "Looked up" : "Looking up"} orders${args?.query ? ` for “${String(args.query)}”` : ""}`,
      pill: result?.success ? pill(result.data, "found") : undefined,
    }),
    detail: OrdersCard,
  },
  check_refund: {
    label: ({ args, result }) => {
      const r = result?.success ? (result.data as RefundCheck | undefined) : undefined;
      return {
        text: `${result ? "Checked" : "Checking"} the refund rules${args?.orderRef ? ` for order ${String(args.orderRef)}` : ""}`,
        pill: r && !("error" in r) ? verdictOf(r.verdict).label : undefined,
      };
    },
    detail: RefundCard,
  },
};
