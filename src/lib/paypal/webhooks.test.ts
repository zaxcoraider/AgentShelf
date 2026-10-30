import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretEvent, verifyWebhook } from "./webhooks";

// Trimmed from PayPal's sample webhook payloads.

test("order approved gives the PayPal order id", () => {
  const intent = interpretEvent({
    id: "WH-1",
    event_type: "CHECKOUT.ORDER.APPROVED",
    resource: { id: "5O190127TN364715T", status: "APPROVED", intent: "CAPTURE" },
  });
  assert.deepEqual(intent, { kind: "order_approved", paypalOrderId: "5O190127TN364715T" });
});

test("capture completed links the capture to its order", () => {
  const intent = interpretEvent({
    id: "WH-2",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "42311647XV020574X",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "27.95" },
      supplementary_data: { related_ids: { order_id: "5O190127TN364715T" } },
    },
  });
  assert.deepEqual(intent, { kind: "capture_completed", captureId: "42311647XV020574X", paypalOrderId: "5O190127TN364715T" });
});

test("refund reads the capture from the up link and the running total", () => {
  const intent = interpretEvent({
    id: "WH-3",
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    resource: {
      id: "1Y107995YT783435V",
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "10.00" },
      seller_payable_breakdown: { total_refunded_amount: { currency_code: "USD", value: "15.50" } },
      links: [
        { rel: "self", href: "https://api.sandbox.paypal.com/v2/payments/refunds/1Y107995YT783435V" },
        { rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/42311647XV020574X" },
      ],
    },
  });
  assert.deepEqual(intent, { kind: "capture_refunded", captureId: "42311647XV020574X", refundCents: 1000, totalRefundedCents: 1550 });
});

test("dispute created carries the deadline and disputed capture", () => {
  const intent = interpretEvent({
    id: "WH-4",
    event_type: "CUSTOMER.DISPUTE.CREATED",
    resource: {
      dispute_id: "PP-D-12345",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_amount: { currency_code: "USD", value: "27.95" },
      seller_response_due_date: "2026-11-20T10:00:00.000Z",
      disputed_transactions: [{ seller_transaction_id: "42311647XV020574X", buyer_transaction_id: "B1" }],
    },
  });
  assert.deepEqual(intent, {
    kind: "dispute",
    disputeId: "PP-D-12345",
    captureIds: ["42311647XV020574X"],
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status: "WAITING_FOR_SELLER_RESPONSE",
    amountCents: 2795,
    responseDueAt: new Date("2026-11-20T10:00:00.000Z"),
  });
});

test("unknown or malformed events are ignored", () => {
  assert.deepEqual(interpretEvent({ id: "WH-5", event_type: "BILLING.PLAN.CREATED", resource: {} }), { kind: "ignored" });
  assert.deepEqual(interpretEvent({ id: "WH-6", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { links: [] } }), { kind: "ignored" });
});

test("a request without PayPal's signature headers is rejected", async () => {
  assert.equal(await verifyWebhook(new Headers(), "{}", "WH-ID"), false);
});
