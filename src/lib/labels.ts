import type { AgentAction, Order } from "./db/schema";

/** Plain-English labels for the seller's screens: the Inbox and the AG Studio dashboard. */

export const ACTION_STATUS_LABEL: Record<AgentAction["status"], string> = {
  auto: "Done by agent",
  pending_approval: "Needs you",
  approved: "Approved",
  rejected: "Rejected",
  blocked: "Blocked by rule",
  failed: "Failed",
};

export const TOOL_LABEL: Record<string, string> = {
  refund_order: "Refund",
  add_tracking: "Shipment tracking",
  create_shipment_tracking: "Shipment tracking",
  create_refund: "Refund",
  get_dispute: "Dispute review",
  review_dispute: "Dispute review",
};

export const DISPUTE_REASON: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Buyer says it never arrived",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Buyer says it isn't as described",
  UNAUTHORISED: "Buyer says they didn't make this payment",
  DUPLICATE_TRANSACTION: "Buyer says they were charged twice",
};

export const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  created: "Checkout started",
  approved: "Approved, not captured",
  paid: "Paid",
  shipped: "Shipped",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  disputed: "Disputed",
  cancelled: "Cancelled",
};
