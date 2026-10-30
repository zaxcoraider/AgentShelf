import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { usd } from "./money";
import { getOrderPayment } from "./paypal/client";
import { interpretEvent, type PaypalEvent, type WebhookIntent } from "./paypal/webhooks";
import { completeCheckout, markPaid } from "./shop";

/**
 * Apply a verified PayPal webhook to our orders and disputes. PayPal retries and may
 * deliver an event more than once; each event id is processed at most once, and every
 * update is written so that replaying it changes nothing.
 */
export async function handleWebhook(event: PaypalEvent): Promise<string> {
  const intent = interpretEvent(event);
  const resourceId = typeof event.resource?.id === "string" ? event.resource.id : null;

  const [fresh] = await db
    .insert(schema.webhookEvents)
    .values({ id: event.id, type: event.event_type, resourceId, payload: event })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (!fresh) return "duplicate delivery, skipped";

  let outcome: string;
  try {
    outcome = await apply(intent);
  } catch (err) {
    // Forget the event so PayPal's retry gets a clean second attempt.
    await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, event.id));
    throw err;
  }
  await db.update(schema.webhookEvents).set({ outcome }).where(eq(schema.webhookEvents.id, event.id));
  return outcome;
}

const findBy = {
  paypalOrderId: (id: string) => db.query.orders.findFirst({ where: eq(schema.orders.paypalOrderId, id) }),
  captureId: (id: string) => db.query.orders.findFirst({ where: eq(schema.orders.captureId, id) }),
};

async function apply(intent: WebhookIntent): Promise<string> {
  switch (intent.kind) {
    case "order_approved": {
      const order = await findBy.paypalOrderId(intent.paypalOrderId);
      if (!order) return "ignored: not an AgentShelf order";
      if (order.status !== "created" && order.status !== "approved") return "already captured";
      // Covers buyers who approve in PayPal and close the tab before coming back to us.
      await completeCheckout(intent.paypalOrderId);
      return "captured from webhook";
    }

    case "capture_completed": {
      const order =
        (intent.paypalOrderId && (await findBy.paypalOrderId(intent.paypalOrderId))) ||
        (await findBy.captureId(intent.captureId));
      if (!order) return "ignored: not an AgentShelf order";
      if (order.status !== "created" && order.status !== "approved") return "already paid";
      // The capture event has no payer details; read them from the order.
      const payment = order.paypalOrderId ? await getOrderPayment(order.paypalOrderId) : undefined;
      await markPaid(order, { ...payment, captureId: intent.captureId });
      return "order paid";
    }

    case "capture_refunded": {
      const order = await findBy.captureId(intent.captureId);
      if (!order) return "ignored: not an AgentShelf order";
      // PayPal sends the capture's running refund total, so this is the same however often it arrives.
      // Refunds AgentShelf made itself are already counted; this catches ones made in PayPal directly.
      const total = intent.totalRefundedCents ?? order.refundedCents + (intent.refundCents ?? 0);
      const refundedCents = Math.min(Math.max(order.refundedCents, total), order.amountCents);
      if (refundedCents === order.refundedCents) return "refund already recorded";
      await db
        .update(schema.orders)
        .set({
          refundedCents,
          status: order.status === "disputed" ? "disputed" : refundedCents >= order.amountCents ? "refunded" : "partially_refunded",
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id));
      return `recorded refund made outside AgentShelf; ${usd(refundedCents)} refunded in total`;
    }

    case "dispute": {
      const [order] = intent.captureIds.length
        ? await db.select().from(schema.orders).where(inArray(schema.orders.captureId, intent.captureIds)).limit(1)
        : [];
      if (!order) return "ignored: dispute on a payment AgentShelf doesn't know";
      const fields = {
        status: intent.status,
        reason: intent.reason,
        amountCents: intent.amountCents,
        responseDueAt: intent.responseDueAt,
        updatedAt: new Date(),
      };
      await db
        .insert(schema.disputes)
        .values({ orderId: order.id, paypalDisputeId: intent.disputeId, ...fields })
        .onConflictDoUpdate({ target: schema.disputes.paypalDisputeId, set: fields });
      // An open dispute freezes the order: the agent's guardrails refuse to refund disputed orders.
      if (intent.status !== "RESOLVED" && order.status !== "disputed") {
        await db
          .update(schema.orders)
          .set({ status: "disputed", updatedAt: new Date() })
          .where(eq(schema.orders.id, order.id));
      }
      return `dispute ${intent.disputeId} ${intent.status.toLowerCase()}`;
    }

    case "ignored":
      return "ignored: event type not handled";
  }
}
