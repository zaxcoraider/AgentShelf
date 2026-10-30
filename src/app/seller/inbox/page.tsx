import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import type { AgentAction } from "@/lib/db/schema";
import { usd } from "@/lib/money";
import { timeAgo } from "@/lib/seller";
import { requireSeller } from "@/lib/seller-session";
import { aiConfigured } from "@/lib/ai";
import { ApprovalButtons, AskAgent, ShipForm } from "./forms";

// Seller inbox: refunds waiting for approval, paid orders to ship, and everything the agent did.
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<AgentAction["status"], { label: string; className: string }> = {
  auto: { label: "Done by agent", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  pending_approval: { label: "Needs you", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Rejected", className: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
  blocked: { label: "Blocked by rule", className: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

const TOOL_LABEL: Record<string, string> = {
  refund_order: "Refund",
  add_tracking: "Shipment tracking",
  create_shipment_tracking: "Shipment tracking",
  create_refund: "Refund",
  get_dispute: "Dispute review",
  review_dispute: "Dispute review",
};

/** Activity log filters: which tools each one shows. */
const FILTERS = {
  all: { label: "All", tools: null },
  refunds: { label: "Refunds", tools: ["refund_order", "create_refund"] },
  tracking: { label: "Tracking", tools: ["add_tracking", "create_shipment_tracking"] },
  disputes: { label: "Disputes", tools: ["get_dispute", "review_dispute"] },
} as const;
type Filter = keyof typeof FILTERS;

const DISPUTE_REASON: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Buyer says it never arrived",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Buyer says it isn't as described",
  UNAUTHORISED: "Buyer says they didn't make this payment",
  DUPLICATE_TRANSACTION: "Buyer says they were charged twice",
};

/** "Respond in 3 days" countdown; red once two days or less remain. */
function dueLabel(due: Date | null, now = Date.now()) {
  if (!due) return { text: "No deadline from PayPal yet", urgent: false };
  const days = Math.ceil((due.getTime() - now) / 86_400_000);
  if (days < 0) return { text: "Response overdue", urgent: true };
  if (days === 0) return { text: "Respond today", urgent: true };
  return { text: `Respond within ${days} day${days === 1 ? "" : "s"}`, urgent: days <= 2 };
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">
        {title}
        {count != null && <span className="ml-2 text-sm font-normal opacity-60">{count}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm opacity-70 dark:border-stone-700">{children}</p>;
}

export default async function Inbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const seller = await requireSeller();
  const { show } = await searchParams;
  const filter: Filter = show && show in FILTERS ? (show as Filter) : "all";
  const filterTools = FILTERS[filter].tools;

  const [pending, toShip, activity, products, openDisputes] = await Promise.all([
    db.query.agentActions.findMany({
      where: and(eq(schema.agentActions.sellerId, seller.id), eq(schema.agentActions.status, "pending_approval")),
      orderBy: desc(schema.agentActions.createdAt),
    }),
    db.query.orders.findMany({
      where: and(eq(schema.orders.sellerId, seller.id), eq(schema.orders.status, "paid"), eq(schema.orders.demo, false)),
      orderBy: desc(schema.orders.createdAt),
    }),
    db.query.agentActions.findMany({
      where: and(
        eq(schema.agentActions.sellerId, seller.id),
        filterTools ? inArray(schema.agentActions.tool, [...filterTools]) : undefined,
      ),
      orderBy: desc(schema.agentActions.createdAt),
      limit: 30,
    }),
    db.query.products.findMany({ where: eq(schema.products.sellerId, seller.id) }),
    db
      .select({ dispute: schema.disputes, order: schema.orders })
      .from(schema.disputes)
      .innerJoin(schema.orders, eq(schema.disputes.orderId, schema.orders.id))
      .where(and(eq(schema.orders.sellerId, seller.id), ne(schema.disputes.status, "RESOLVED")))
      .orderBy(asc(schema.disputes.responseDueAt)),
  ]);

  const orderIds = [...new Set([...pending, ...activity].map((a) => a.orderId).filter((id): id is string => !!id))];
  const orders = orderIds.length
    ? await db.query.orders.findMany({ where: inArray(schema.orders.id, orderIds) })
    : [];
  const orderById = new Map([...orders, ...toShip, ...openDisputes.map((d) => d.order)].map((o) => [o.id, o]));
  const titleById = new Map(products.map((p) => [p.id, p.title]));

  const describeOrder = (orderId: string | null) => {
    const o = orderId ? orderById.get(orderId) : undefined;
    if (!o) return "Unknown order";
    const who = o.channel === "ai_agent" ? `via ${o.agentName ?? "AI assistant"}` : "via storefront";
    return `${o.productId ? titleById.get(o.productId) : "Order"}${o.quantity > 1 ? ` ×${o.quantity}` : ""} · ${usd(o.amountCents)} · ${o.buyerName ?? "buyer"} ${who}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
      <p className="mt-1 text-sm opacity-70">
        Your agent refunds up to {usd(seller.refundAutoLimitCents)} on its own. Anything larger waits here for you.
      </p>

      <div className="mt-6">
        <AskAgent enabled={aiConfigured("agent")} />
      </div>

      <Section title="Needs your approval" count={pending.length}>
        {pending.length === 0 ? (
          <Empty>Nothing waiting. Your agent is handling everything within your rules.</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((a) => {
              const amount = usd(Number((a.input as { amountCents?: number } | null)?.amountCents ?? 0));
              return (
                <li key={a.id} className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="font-medium">
                    {TOOL_LABEL[a.tool] ?? a.tool} of {amount}
                  </p>
                  <p className="mt-0.5 text-sm opacity-70">{describeOrder(a.orderId)}</p>
                  <p className="mt-2 text-sm">
                    <span className="opacity-60">Agent: </span>
                    {a.reason}
                  </p>
                  <div className="mt-3">
                    <ApprovalButtons actionId={a.id} amount={amount} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Open disputes" count={openDisputes.length}>
        {openDisputes.length === 0 ? (
          <Empty>No open disputes.</Empty>
        ) : (
          <ul className="space-y-3">
            {openDisputes.map(({ dispute: d, order: o }) => {
              const due = dueLabel(d.responseDueAt);
              return (
                <li key={d.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {DISPUTE_REASON[d.reason ?? ""] ?? "Buyer opened a dispute"}
                      {d.amountCents != null && ` · ${usd(d.amountCents)}`}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        due.urgent
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {due.text}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm opacity-70">{describeOrder(o.id)}</p>
                  {d.aiRecommendation && (
                    <p className="mt-2 text-sm">
                      <span className="opacity-60">Agent: </span>
                      {d.aiRecommendation}
                    </p>
                  )}
                  <p className="mt-2 text-xs opacity-60">
                    PayPal case {d.paypalDisputeId}. Refunds on this order are paused until it&apos;s resolved.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Ready to ship" count={toShip.length}>
        {toShip.length === 0 ? (
          <Empty>No paid orders waiting to ship.</Empty>
        ) : (
          <ul className="space-y-3">
            {toShip.map((o) => (
              <li key={o.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                <p className="font-medium">{describeOrder(o.id)}</p>
                <p className="mb-3 text-sm opacity-60">Paid {timeAgo(o.createdAt)}</p>
                <ShipForm orderId={o.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Agent activity">
        <nav className="mb-3 flex flex-wrap gap-2 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <Link
              key={key}
              href={key === "all" ? "/seller/inbox" : `/seller/inbox?show=${key}`}
              scroll={false}
              className={`rounded-full border px-3 py-1 transition-colors ${
                key === filter
                  ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                  : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              }`}
            >
              {FILTERS[key].label}
            </Link>
          ))}
        </nav>
        {activity.length === 0 ? (
          <Empty>{filter === "all" ? "No agent activity yet." : `No ${FILTERS[filter].label.toLowerCase()} yet.`}</Empty>
        ) : (
          <ol className="divide-y divide-stone-200 dark:divide-stone-800">
            {activity.map((a) => {
              const style = STATUS_STYLE[a.status];
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
                    <span className="font-medium">{TOOL_LABEL[a.tool] ?? a.tool}</span>
                    <span className="opacity-60">{timeAgo(a.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm opacity-70">{describeOrder(a.orderId)}</p>
                  {a.reason && <p className="mt-1 text-sm">{a.reason}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </main>
  );
}
