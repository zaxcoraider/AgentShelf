import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { AgentAction, Order, Seller } from "../db/schema";
import { usd } from "../money";
import { addOrderTracking, refundCapture, type Carrier } from "../paypal/client";
import { decideRefund } from "./guardrails";

/**
 * Seller-agent actions that move money or touch PayPal records. Every call ends in an
 * `agent_actions` row: auto, pending_approval, approved, rejected, blocked, or failed.
 * Used by the agent's tools and by the seller's approve/reject buttons.
 */

type RefundInput = {
  amountCents?: number;
  note?: string;
  /** Send it to the seller even if the rules would allow an automatic refund (the agent isn't sure). */
  askSeller?: boolean;
};

export type ActionResult = { action: AgentAction; message: string };

export class ActionError extends Error {}

async function loadOrder(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order) throw new ActionError(`No order ${orderId}.`);
  const seller = await db.query.sellers.findFirst({ where: eq(schema.sellers.id, order.sellerId) });
  if (!seller) throw new ActionError(`Order ${orderId} has no seller.`);
  return { order, seller };
}

async function log(values: typeof schema.agentActions.$inferInsert) {
  const [action] = await db.insert(schema.agentActions).values(values).returning();
  return action;
}

/** A readable reason, including PayPal SDK errors whose message is empty but whose body names the issue. */
function errorText(err: unknown) {
  const api = err as { message?: string; statusCode?: number; result?: { name?: string; message?: string; details?: { issue?: string; description?: string }[] } };
  const detail = api?.result?.details?.[0];
  const fromPaypal = [api?.result?.name, detail?.issue, detail?.description ?? api?.result?.message].filter(Boolean).join(": ");
  if (fromPaypal) return fromPaypal;
  if (api?.message) return api.message;
  return api?.statusCode ? `PayPal answered HTTP ${api.statusCode}.` : String(err);
}

/**
 * Seeded demo orders have no PayPal payment behind them, and the showcase shop is shared by every
 * judge. Acting on one is a preview: we say exactly what would happen on a real order and change
 * nothing, so the approval queue and dispute notes look the same for the next visitor.
 * Real orders (a judge's own sandbox purchase) still run for real.
 */
export const PREVIEW_NOTE = "This is seeded demo history, so nothing changed and the demo stays the same for everyone.";

export async function previewRefund(seller: Pick<Seller, "id" | "refundAutoLimitCents">, order: Order, amountCents?: number, opts: { approving?: boolean } = {}) {
  // Judge the order as if it had been paid through PayPal.
  const asPaid = { ...order, demo: false, captureId: order.captureId ?? "preview" };
  const decision = decideRefund({
    seller: opts.approving ? { refundAutoLimitCents: Number.MAX_SAFE_INTEGER } : seller,
    order: asPaid,
    amountCents,
    autoRefundedTodayCents: opts.approving ? 0 : await autoRefundedToday(seller.id),
  });
  const what =
    decision.kind === "blocked"
      ? `Preview: this refund would be refused (${decision.why})`
      : decision.kind === "needs_approval" && !opts.approving
        ? `Preview: this would go to the seller's approval queue (${decision.why})`
        : `Preview: this would refund ${usd(decision.amountCents)} through PayPal right away${opts.approving ? "" : ` (${decision.why})`}`;
  return `${what}. ${PREVIEW_NOTE}`;
}

export function previewTracking(input: { carrier: Carrier; trackingNumber: string }) {
  return `Preview: this would add ${input.carrier} tracking ${input.trackingNumber} to the PayPal order, and PayPal would email the buyer. ${PREVIEW_NOTE}`;
}

/** Refunds the agent made on its own for this seller since midnight UTC. */
type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function autoRefundedToday(sellerId: string, exec: Db | Tx = db) {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [row] = await exec
    .select({ total: sql<number>`coalesce(sum((${schema.agentActions.input}->>'amountCents')::int), 0)` })
    .from(schema.agentActions)
    .where(
      and(
        eq(schema.agentActions.sellerId, sellerId),
        eq(schema.agentActions.tool, "refund_order"),
        eq(schema.agentActions.status, "auto"),
        gte(schema.agentActions.createdAt, midnight),
      ),
    );
  return Number(row?.total ?? 0);
}

const REFUNDABLE: Order["status"][] = ["paid", "shipped", "partially_refunded"];

/**
 * Take the amount out of what's left on the order in one atomic UPDATE, before PayPal is called.
 * Two refunds racing for the same order can't both pass: the second sees the first's reservation.
 * Returns false when the order changed underneath us (already refunded, disputed, ...).
 */
async function reserveRefund(exec: Db | Tx, orderId: string, amountCents: number) {
  const [row] = await exec
    .update(schema.orders)
    .set({ refundedCents: sql`${schema.orders.refundedCents} + ${amountCents}`, updatedAt: new Date() })
    .where(
      and(
        eq(schema.orders.id, orderId),
        inArray(schema.orders.status, REFUNDABLE),
        sql`${schema.orders.refundedCents} + ${amountCents} <= ${schema.orders.amountCents}`,
      ),
    )
    .returning({ id: schema.orders.id });
  return Boolean(row);
}

/**
 * Call PayPal for an already-reserved amount. If PayPal refuses, the reservation is given back.
 * Once PayPal has refunded, the reservation stands whatever happens next: our record must never
 * say less was refunded than PayPal did.
 */
async function executeRefund(order: Order, amountCents: number, note: string | undefined, requestId: string) {
  let refund;
  try {
    refund = await refundCapture({ captureId: order.captureId!, amountCents, note, requestId });
  } catch (err) {
    await db
      .update(schema.orders)
      .set({ refundedCents: sql`greatest(${schema.orders.refundedCents} - ${amountCents}, 0)`, updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    throw err;
  }
  await db
    .update(schema.orders)
    .set({
      status: sql`(case when ${schema.orders.refundedCents} >= ${schema.orders.amountCents} then 'refunded' else 'partially_refunded' end)::order_status`,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, order.id))
    .catch((err) => console.error(`[refund] PayPal refunded order ${order.id} but its status didn't update:`, err));
  return refund;
}

const CHANGED = "The order changed while this was being decided (another refund or a dispute). Nothing was refunded.";

/**
 * The agent asks to refund an order. Guardrails decide: refund now, queue for the
 * seller, or refuse. `reason` is the agent's own explanation, shown to the seller.
 */
export async function requestRefund(orderId: string, reason: string, input: RefundInput = {}): Promise<ActionResult> {
  const { seller } = await loadOrder(orderId);
  const base = { sellerId: seller.id, orderId, tool: "refund_order" };

  // One refund decision per shop at a time: locking the seller row serializes the daily-cap check,
  // and the order is re-read inside the lock so the decision sees any refund that just landed.
  const decided = await db.transaction(async (tx) => {
    await tx.select({ id: schema.sellers.id }).from(schema.sellers).where(eq(schema.sellers.id, seller.id)).for("update");
    const order = (await tx.query.orders.findFirst({ where: eq(schema.orders.id, orderId) }))!;
    const decision = decideRefund({
      seller,
      order,
      amountCents: input.amountCents,
      autoRefundedTodayCents: await autoRefundedToday(seller.id, tx),
    });
    const log = async (values: Omit<typeof schema.agentActions.$inferInsert, "sellerId" | "orderId" | "tool">) =>
      (await tx.insert(schema.agentActions).values({ ...base, ...values }).returning())[0];

    if (decision.kind === "blocked") {
      const action = await log({ input, status: "blocked", reason: `${reason} Blocked: ${decision.why}` });
      return { done: { action, message: `Refund blocked: ${decision.why}` } };
    }
    const actionInput = { amountCents: decision.amountCents, note: input.note };
    if (decision.kind === "needs_approval" || input.askSeller) {
      const why = decision.kind === "needs_approval" ? decision.why : "The agent asked you to decide.";
      const action = await log({ input: actionInput, status: "pending_approval", reason: `${reason} ${why}` });
      return { done: { action, message: `Sent to the seller for approval: ${why}` } };
    }
    if (!(await reserveRefund(tx, order.id, decision.amountCents))) {
      const action = await log({ input: actionInput, status: "blocked", reason: `${reason} Blocked: ${CHANGED}` });
      return { done: { action, message: `Refund blocked: ${CHANGED}` } };
    }
    const action = await log({ input: actionInput, status: "auto", reason: `${reason} ${decision.why}` });
    return { refund: { action, order, amountCents: decision.amountCents } };
  });
  if (decided.done) return decided.done;

  const { action, order, amountCents } = decided.refund!;
  try {
    const refund = await executeRefund(order, amountCents, input.note, action.id);
    const [done] = await db
      .update(schema.agentActions)
      .set({ output: refund })
      .where(eq(schema.agentActions.id, action.id))
      .returning();
    return { action: done, message: `Refunded ${usd(amountCents)} (PayPal refund ${refund.refundId}).` };
  } catch (err) {
    const [failed] = await db
      .update(schema.agentActions)
      .set({ status: "failed", output: { error: errorText(err) } })
      .where(eq(schema.agentActions.id, action.id))
      .returning();
    return { action: failed, message: `PayPal refused the refund: ${errorText(err)}` };
  }
}

/** Claim a pending action exactly once, so a double click can't approve or reject it twice. */
async function claimPending(actionId: string, status: "approved" | "rejected") {
  const [claimed] = await db
    .update(schema.agentActions)
    .set({ status })
    .where(and(eq(schema.agentActions.id, actionId), eq(schema.agentActions.status, "pending_approval")))
    .returning();
  if (!claimed) throw new ActionError("That request was already handled.");
  return claimed;
}

/** Seller approves a queued refund. The over-limit rule is waived; every other rule still applies. */
export async function approveAction(actionId: string): Promise<ActionResult> {
  const action = await claimPending(actionId, "approved");
  if (action.tool !== "refund_order" || !action.orderId) throw new ActionError(`Can't approve a ${action.tool} action.`);
  const input = (action.input ?? {}) as RefundInput;

  try {
    const { order } = await loadOrder(action.orderId);
    const recheck = decideRefund({
      seller: { refundAutoLimitCents: Number.MAX_SAFE_INTEGER },
      order,
      amountCents: input.amountCents,
      autoRefundedTodayCents: 0,
    });
    if (recheck.kind === "blocked") throw new ActionError(recheck.why);
    if (!(await reserveRefund(db, order.id, recheck.amountCents))) throw new ActionError(CHANGED);
    const refund = await executeRefund(order, recheck.amountCents, input.note, action.id);
    const [done] = await db
      .update(schema.agentActions)
      .set({ output: refund })
      .where(eq(schema.agentActions.id, action.id))
      .returning();
    return { action: done, message: `Approved and refunded ${usd(recheck.amountCents)}.` };
  } catch (err) {
    const [failed] = await db
      .update(schema.agentActions)
      .set({ status: "failed", output: { error: errorText(err) } })
      .where(eq(schema.agentActions.id, action.id))
      .returning();
    return { action: failed, message: `Approved, but the refund failed: ${errorText(err)}` };
  }
}

export async function rejectAction(actionId: string, note?: string): Promise<ActionResult> {
  const action = await claimPending(actionId, "rejected");
  const [done] = await db
    .update(schema.agentActions)
    .set({ output: { rejectedBecause: note ?? null } })
    .where(eq(schema.agentActions.id, action.id))
    .returning();
  return { action: done, message: "Rejected. No money moved." };
}

/** Mark an order shipped and attach tracking to its PayPal order. */
export async function markShipped(
  orderId: string,
  input: { carrier: Carrier; trackingNumber: string },
  reason = "Seller marked the order shipped.",
): Promise<ActionResult> {
  const { order, seller } = await loadOrder(orderId);
  const base = { sellerId: seller.id, orderId: order.id, tool: "add_tracking", input };

  if (order.demo || !order.paypalOrderId || !order.captureId) {
    const why = order.demo ? "seeded demo history" : "the order has no captured PayPal payment";
    const action = await log({ ...base, status: "blocked", reason: `${reason} Blocked: ${why}.` });
    return { action, message: `Tracking not added: ${why}.` };
  }

  try {
    const result = await addOrderTracking({
      paypalOrderId: order.paypalOrderId,
      captureId: order.captureId,
      ...input,
    });
    await db
      .update(schema.orders)
      .set({
        status: order.status === "paid" ? "shipped" : order.status,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, order.id));
    const action = await log({ ...base, status: "auto", output: result, reason: `${reason} Added ${input.carrier} tracking to the PayPal order.` });
    return { action, message: `Tracking added; PayPal will notify the buyer.` };
  } catch (err) {
    const action = await log({ ...base, status: "failed", output: { error: errorText(err) }, reason });
    return { action, message: `PayPal refused the tracking update: ${errorText(err)}` };
  }
}

/** The agent's verdict on a PayPal dispute. Advice only: the seller responds in PayPal. */
export async function recordDisputeReview(disputeId: string, recommendation: string): Promise<ActionResult> {
  const dispute = await db.query.disputes.findFirst({ where: eq(schema.disputes.id, disputeId) });
  if (!dispute) throw new ActionError(`No dispute ${disputeId}.`);
  const { order, seller } = await loadOrder(dispute.orderId);
  await db
    .update(schema.disputes)
    .set({ aiRecommendation: recommendation, updatedAt: new Date() })
    .where(eq(schema.disputes.id, dispute.id));
  const action = await log({
    sellerId: seller.id,
    orderId: order.id,
    tool: "review_dispute",
    input: { paypalDisputeId: dispute.paypalDisputeId },
    status: "auto",
    reason: recommendation,
  });
  return { action, message: "Recommendation saved for the seller." };
}
