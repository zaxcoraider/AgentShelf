import { and, desc, eq, inArray } from "drizzle-orm";
import { autoRefundedToday } from "../agent/actions";
import { DAILY_AUTO_REFUND_CAP_CENTS, decideRefund } from "../agent/guardrails";
import { db, schema } from "../db";
import { disputeDueAt } from "../disputes";
import type { Order, Seller } from "../db/schema";
import { ACTION_STATUS_LABEL, DISPUTE_REASON, ORDER_STATUS_LABEL, TOOL_LABEL } from "../labels";
import { usd } from "../money";

/**
 * The PayPal seller agent's tools inside the AG Studio dashboard. All read-only: the dashboard
 * agent can look, explain and dry-run the refund rules, but money only moves from the Inbox.
 * Each returns plain JSON the model reads; `ref` is the short order id the seller sees.
 */

const HOUR = 60 * 60 * 1000;
const ref = (id: string) => id.slice(0, 8);

function orderLine(o: Order, productTitle?: string | null) {
  return {
    ref: ref(o.id),
    buyer: o.buyerName ?? "Unknown",
    product: productTitle ?? "Unknown product",
    boughtVia: o.channel === "ai_agent" ? (o.agentName ?? "AI assistant") : "Storefront",
    status: ORDER_STATUS_LABEL[o.status],
    total: usd(o.amountCents),
    refunded: o.refundedCents ? usd(o.refundedCents) : undefined,
    placed: o.createdAt.toISOString().slice(0, 10),
    tracking: o.trackingNumber ? `${o.carrier ?? ""} ${o.trackingNumber}`.trim() : undefined,
    origin: o.demo ? "seeded demo history (no real PayPal payment)" : "live PayPal sandbox",
  };
}

async function productTitles(sellerId: string) {
  const rows = await db.query.products.findMany({ where: eq(schema.products.sellerId, sellerId) });
  return new Map(rows.map((p) => [p.id, p.title]));
}

/** What needs the seller now: disputes by deadline, approvals waiting, orders to ship, refund headroom. */
export async function shopBriefing(seller: Seller, now = Date.now()) {
  const [titles, toShip, pending, disputes, refundedToday] = await Promise.all([
    productTitles(seller.id),
    db.query.orders.findMany({
      where: and(eq(schema.orders.sellerId, seller.id), eq(schema.orders.status, "paid")),
      orderBy: [schema.orders.createdAt],
    }),
    db.query.agentActions.findMany({
      where: and(eq(schema.agentActions.sellerId, seller.id), eq(schema.agentActions.status, "pending_approval")),
      orderBy: [desc(schema.agentActions.createdAt)],
    }),
    db
      .select({ dispute: schema.disputes, order: schema.orders })
      .from(schema.disputes)
      .innerJoin(schema.orders, eq(schema.disputes.orderId, schema.orders.id))
      .where(eq(schema.orders.sellerId, seller.id)),
    autoRefundedToday(seller.id),
  ]);

  const openDisputes = disputes
    .filter(({ dispute }) => dispute.status !== "RESOLVED")
    .map(({ dispute: d, order }) => {
      const dueAt = disputeDueAt(d.responseDueAt, order.demo, now);
      const hoursLeft = dueAt ? Math.round((dueAt.getTime() - now) / HOUR) : null;
      return {
        order: orderLine(order, order.productId ? titles.get(order.productId) : null),
        reason: DISPUTE_REASON[d.reason ?? ""] ?? "Buyer opened a dispute",
        amount: d.amountCents != null ? usd(d.amountCents) : undefined,
        respondBy: dueAt?.toISOString(),
        hoursLeft,
        overdue: hoursLeft != null && hoursLeft < 0,
        agentRecommendation: d.aiRecommendation ?? undefined,
      };
    })
    .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));

  return {
    shop: seller.name,
    openDisputes,
    waitingForYourApproval: pending.map((a) => ({
      action: TOOL_LABEL[a.tool] ?? a.tool,
      orderRef: a.orderId ? ref(a.orderId) : undefined,
      amount: amountOf(a.input),
      agentReason: a.reason ?? "",
      asked: a.createdAt.toISOString(),
    })),
    readyToShip: toShip.map((o) => orderLine(o, o.productId ? titles.get(o.productId) : null)),
    refundRules: refundRules(seller, refundedToday),
  };
}

function refundRules(seller: Seller, refundedTodayCents: number) {
  return {
    autoRefundLimitPerOrder: usd(seller.refundAutoLimitCents),
    dailyAutoRefundCap: usd(DAILY_AUTO_REFUND_CAP_CENTS),
    autoRefundedToday: usd(refundedTodayCents),
    headroomToday: usd(Math.max(0, DAILY_AUTO_REFUND_CAP_CENTS - refundedTodayCents)),
    alwaysBlocked: "Seeded demo orders, disputed orders, unpaid orders and fully refunded orders.",
  };
}

const amountOf = (input: unknown) => {
  const cents = (input as { amountCents?: unknown } | null)?.amountCents;
  return typeof cents === "number" ? usd(cents) : undefined;
};

/** The seller agent's own log: what it did, what it queued, and what the rules blocked. */
export async function agentActivity(seller: Seller, opts: { outcome?: string; limit?: number }) {
  const statuses = Object.entries(ACTION_STATUS_LABEL)
    .filter(([, label]) => !opts.outcome || label.toLowerCase() === opts.outcome.toLowerCase())
    .map(([status]) => status as keyof typeof ACTION_STATUS_LABEL);
  const rows = await db.query.agentActions.findMany({
    where: and(eq(schema.agentActions.sellerId, seller.id), inArray(schema.agentActions.status, statuses)),
    orderBy: [desc(schema.agentActions.createdAt)],
    limit: Math.min(Math.max(opts.limit ?? 15, 1), 50),
  });
  return rows.map((a) => ({
    when: a.createdAt.toISOString(),
    action: TOOL_LABEL[a.tool] ?? a.tool,
    outcome: ACTION_STATUS_LABEL[a.status],
    orderRef: a.orderId ? ref(a.orderId) : undefined,
    amount: amountOf(a.input),
    agentReason: a.reason ?? "",
  }));
}

/** Orders matching a short ref, buyer, product or assistant name. Newest first. */
export async function findOrders(seller: Seller, query: string) {
  const [titles, orders] = await Promise.all([
    productTitles(seller.id),
    db.query.orders.findMany({
      where: eq(schema.orders.sellerId, seller.id),
      orderBy: [desc(schema.orders.createdAt)],
    }),
  ]);
  const q = query.trim().toLowerCase();
  const hits = orders.filter((o) => {
    const title = o.productId ? (titles.get(o.productId) ?? "") : "";
    return [o.id, o.buyerName ?? "", title, o.agentName ?? "", o.buyerEmail ?? ""].some((s) =>
      s.toLowerCase().includes(q),
    );
  });
  return hits.slice(0, 10).map((o) => orderLine(o, o.productId ? titles.get(o.productId) : null));
}

/** Dry-run the refund guardrails for one order, without refunding anything. */
export async function checkRefund(seller: Seller, orderRef: string, amountDollars?: number) {
  const r = orderRef.trim().toLowerCase();
  const orders = await db.query.orders.findMany({ where: eq(schema.orders.sellerId, seller.id) });
  const matches = orders.filter((o) => o.id.startsWith(r));
  if (matches.length !== 1) {
    return { error: matches.length ? "That ref matches more than one order; use more characters." : `No order ${orderRef}. Use find_orders first.` };
  }
  const order = matches[0];
  const refundedToday = await autoRefundedToday(seller.id);
  const amountCents = amountDollars != null ? Math.round(amountDollars * 100) : undefined;
  const decision = decideRefund({ seller, order, amountCents, autoRefundedTodayCents: refundedToday });
  const verdict = {
    auto: "The seller agent would refund this on its own.",
    needs_approval: "The seller agent would ask you first (it would land in your Inbox).",
    blocked: "The rules would refuse this refund.",
  }[decision.kind];
  return {
    order: orderLine(order),
    verdict,
    amount: "amountCents" in decision ? usd(decision.amountCents) : undefined,
    why: decision.why,
    refundRules: refundRules(seller, refundedToday),
    note: "Dry run only. Nothing was refunded; real refunds happen from the Inbox.",
  };
}

export const STUDIO_SELLER_TOOLS = ["shop_briefing", "agent_activity", "find_orders", "check_refund"] as const;
export type StudioSellerTool = (typeof STUDIO_SELLER_TOOLS)[number];

export async function runStudioSellerTool(seller: Seller, tool: StudioSellerTool, args: Record<string, unknown>) {
  switch (tool) {
    case "shop_briefing":
      return shopBriefing(seller);
    case "agent_activity":
      return agentActivity(seller, {
        outcome: typeof args.outcome === "string" ? args.outcome : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
    case "find_orders":
      return findOrders(seller, String(args.query ?? ""));
    case "check_refund":
      return checkRefund(
        seller,
        String(args.orderRef ?? ""),
        typeof args.amount === "number" ? args.amount : undefined,
      );
  }
}
