import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { AgentAction, Order } from "../db/schema";
import { usd } from "../money";
import { addOrderTracking, refundCapture, type Carrier } from "../paypal/client";
import { decideRefund } from "./guardrails";

/**
 * Seller-agent actions that move money or touch PayPal records. Every call ends in an
 * `agent_actions` row: auto, pending_approval, approved, rejected, blocked, or failed.
 * Used by the agent's tools and by the seller's approve/reject buttons.
 */

type RefundInput = { amountCents?: number; note?: string };

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

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Refunds the agent made on its own for this seller since midnight UTC. */
async function autoRefundedToday(sellerId: string) {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [row] = await db
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

/** Call PayPal, then record the refund on the order. `requestId` keeps retries from refunding twice. */
async function executeRefund(order: Order, amountCents: number, note: string | undefined, requestId: string) {
  const refund = await refundCapture({ captureId: order.captureId!, amountCents, note, requestId });
  const refundedCents = order.refundedCents + amountCents;
  await db
    .update(schema.orders)
    .set({
      refundedCents,
      status: refundedCents >= order.amountCents ? "refunded" : "partially_refunded",
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, order.id));
  return refund;
}

/**
 * The agent asks to refund an order. Guardrails decide: refund now, queue for the
 * seller, or refuse. `reason` is the agent's own explanation, shown to the seller.
 */
export async function requestRefund(orderId: string, reason: string, input: RefundInput = {}): Promise<ActionResult> {
  const { order, seller } = await loadOrder(orderId);
  const decision = decideRefund({
    seller,
    order,
    amountCents: input.amountCents,
    autoRefundedTodayCents: await autoRefundedToday(seller.id),
  });
  const base = { sellerId: seller.id, orderId: order.id, tool: "refund_order" };

  if (decision.kind === "blocked") {
    const action = await log({ ...base, input, status: "blocked", reason: `${reason} Blocked: ${decision.why}` });
    return { action, message: `Refund blocked: ${decision.why}` };
  }

  const actionInput = { amountCents: decision.amountCents, note: input.note };
  if (decision.kind === "needs_approval") {
    const action = await log({ ...base, input: actionInput, status: "pending_approval", reason: `${reason} ${decision.why}` });
    return { action, message: `Sent to the seller for approval: ${decision.why}` };
  }

  // Log first so the action id doubles as PayPal's idempotency key.
  const action = await log({ ...base, input: actionInput, status: "auto", reason: `${reason} ${decision.why}` });
  try {
    const refund = await executeRefund(order, decision.amountCents, input.note, action.id);
    const [done] = await db
      .update(schema.agentActions)
      .set({ output: refund })
      .where(eq(schema.agentActions.id, action.id))
      .returning();
    return { action: done, message: `Refunded ${usd(decision.amountCents)} (PayPal refund ${refund.refundId}).` };
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
