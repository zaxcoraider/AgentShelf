/**
 * Replay sample PayPal webhook events against the local database (no PayPal calls).
 * Creates a throwaway paid order, checks each outcome, then deletes everything it made.
 * Stop `next dev/start` first when using local PGlite. Run: npm run smoke:webhook
 */
import assert from "node:assert/strict";
import { eq, like } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import { handleWebhook } from "../src/lib/webhooks";

const run = `SMOKE-${Date.now()}`;
const seller = await db.query.sellers.findFirst();
if (!seller) throw new Error("No seller; run npm run db:setup first.");

const [order] = await db
  .insert(schema.orders)
  .values({ sellerId: seller.id, channel: "ai_agent", amountCents: 2795, status: "paid", paypalOrderId: `${run}-ORD`, captureId: `${run}-CAP` })
  .returning();

const event = (n: number, event_type: string, resource: Record<string, unknown>) => ({ id: `${run}-EV${n}`, event_type, resource });
const refund = (n: number, total: string) =>
  event(n, "PAYMENT.CAPTURE.REFUNDED", {
    id: `${run}-REF${n}`,
    amount: { value: "10.00" },
    seller_payable_breakdown: { total_refunded_amount: { value: total } },
    links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${run}-CAP` }],
  });
const dispute = (n: number, type: string, status: string) =>
  event(n, type, {
    dispute_id: `${run}-DSP`,
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status,
    dispute_amount: { value: "17.95" },
    seller_response_due_date: "2026-11-20T10:00:00Z",
    disputed_transactions: [{ seller_transaction_id: `${run}-CAP` }],
  });
const reload = async () => (await db.query.orders.findFirst({ where: eq(schema.orders.id, order.id) }))!;

try {
  const steps: [string, ReturnType<typeof event>, (o: schema.Order) => void][] = [
    ["capture for an order that's already paid", event(1, "PAYMENT.CAPTURE.COMPLETED", { id: `${run}-CAP`, supplementary_data: { related_ids: { order_id: `${run}-ORD` } } }), (o) => assert.equal(o.status, "paid")],
    ["$10 refund made in PayPal", refund(2, "10.00"), (o) => (assert.equal(o.refundedCents, 1000), assert.equal(o.status, "partially_refunded"))],
    ["same event redelivered", refund(2, "10.00"), (o) => assert.equal(o.refundedCents, 1000)],
    ["same refund, new event id", refund(3, "10.00"), (o) => assert.equal(o.refundedCents, 1000)],
    ["dispute opened", dispute(4, "CUSTOMER.DISPUTE.CREATED", "WAITING_FOR_SELLER_RESPONSE"), (o) => assert.equal(o.status, "disputed")],
    ["dispute updated", dispute(5, "CUSTOMER.DISPUTE.UPDATED", "UNDER_REVIEW"), (o) => assert.equal(o.status, "disputed")],
    ["refund while disputed keeps it frozen", refund(6, "27.95"), (o) => (assert.equal(o.refundedCents, 2795), assert.equal(o.status, "disputed"))],
    ["unknown order", event(7, "CHECKOUT.ORDER.APPROVED", { id: "NOT-OURS" }), () => {}],
    ["unhandled type", event(8, "BILLING.PLAN.CREATED", {}), () => {}],
  ];
  for (const [label, ev, check] of steps) {
    const { outcome } = await handleWebhook(ev);
    check(await reload());
    console.log(`ok  ${label}: ${outcome}`);
  }
  const d = await db.query.disputes.findFirst({ where: eq(schema.disputes.paypalDisputeId, `${run}-DSP`) });
  assert.equal(d?.status, "UNDER_REVIEW");
  assert.equal(d?.responseDueAt?.toISOString(), "2026-11-20T10:00:00.000Z");
  console.log("ok  dispute row upserted with deadline");
} finally {
  await db.delete(schema.orders).where(eq(schema.orders.id, order.id));
  await db.delete(schema.webhookEvents).where(like(schema.webhookEvents.id, `${run}-%`));
}
process.exit(0);
