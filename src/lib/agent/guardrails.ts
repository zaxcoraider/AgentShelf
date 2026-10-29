import type { Order, Seller } from "../db/schema";
import { usd } from "../money";

/**
 * Money-movement rules for the seller agent, enforced in code. The model never
 * gets PayPal's raw refund tool; it gets `refund_order`, which runs through here.
 */

/** Total the agent may refund on its own per seller per day, across all orders. */
export const DAILY_AUTO_REFUND_CAP_CENTS = 10_000;

const REFUNDABLE_STATUSES: Order["status"][] = ["paid", "shipped", "partially_refunded"];

export type RefundDecision =
  | { kind: "auto"; amountCents: number; why: string }
  | { kind: "needs_approval"; amountCents: number; why: string }
  | { kind: "blocked"; why: string };

export function decideRefund(input: {
  seller: Pick<Seller, "refundAutoLimitCents">;
  order: Pick<Order, "status" | "demo" | "captureId" | "amountCents" | "refundedCents">;
  /** Omit for a full refund of whatever is left. */
  amountCents?: number;
  /** What the agent already refunded automatically for this seller today. */
  autoRefundedTodayCents: number;
}): RefundDecision {
  const { seller, order, autoRefundedTodayCents } = input;
  const remaining = order.amountCents - order.refundedCents;

  if (order.demo) return { kind: "blocked", why: "This is seeded demo history with no real PayPal payment behind it." };
  if (order.status === "disputed") {
    return { kind: "blocked", why: "The order is in a PayPal dispute; resolve it through the dispute instead." };
  }
  if (!REFUNDABLE_STATUSES.includes(order.status) || !order.captureId) {
    return { kind: "blocked", why: `The order is ${order.status}, so there is no captured payment to refund.` };
  }
  if (remaining <= 0) return { kind: "blocked", why: "The order has already been fully refunded." };

  const amountCents = input.amountCents ?? remaining;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { kind: "blocked", why: "The refund amount must be a positive number of cents." };
  }
  if (amountCents > remaining) {
    return { kind: "blocked", why: `Only ${usd(remaining)} is left to refund on this order.` };
  }

  if (amountCents > seller.refundAutoLimitCents) {
    return {
      kind: "needs_approval",
      amountCents,
      why: `${usd(amountCents)} is over the ${usd(seller.refundAutoLimitCents)} auto-refund limit.`,
    };
  }
  if (autoRefundedTodayCents + amountCents > DAILY_AUTO_REFUND_CAP_CENTS) {
    return {
      kind: "needs_approval",
      amountCents,
      why: `Automatic refunds today would pass the ${usd(DAILY_AUTO_REFUND_CAP_CENTS)} daily cap.`,
    };
  }
  return {
    kind: "auto",
    amountCents,
    why: `${usd(amountCents)} is within the ${usd(seller.refundAutoLimitCents)} auto-refund limit.`,
  };
}
