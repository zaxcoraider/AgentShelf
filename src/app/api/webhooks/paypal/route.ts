import { after } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { reviewDispute } from "@/lib/agent/seller-agent";
import { verifyWebhook, type PaypalEvent } from "@/lib/paypal/webhooks";
import { handleWebhook } from "@/lib/webhooks";

// PayPal webhook endpoint. Register https://<host>/api/webhooks/paypal in the PayPal developer
// dashboard and put the webhook's id in PAYPAL_WEBHOOK_ID. A non-2xx reply makes PayPal retry.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (webhookId) {
    if (!(await verifyWebhook(req.headers, raw, webhookId))) {
      return Response.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "PAYPAL_WEBHOOK_ID is not set" }, { status: 503 });
  } else {
    console.warn("[webhook] PAYPAL_WEBHOOK_ID not set; accepting an unverified event (dev only).");
  }

  let event: PaypalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  if (typeof event?.id !== "string" || typeof event.event_type !== "string") {
    return Response.json({ error: "not a PayPal event" }, { status: 400 });
  }

  try {
    const { outcome, newDisputeId } = await handleWebhook(event);
    console.log(`[webhook] ${event.event_type} ${event.id}: ${outcome}`);
    if (newDisputeId && aiConfigured("agent")) {
      // Reply to PayPal right away; the agent reviews the dispute after the response is sent.
      after(() => reviewDispute(newDisputeId).catch((err) => console.error("[webhook] dispute review failed:", err)));
    }
    return Response.json({ ok: true, outcome });
  } catch (err) {
    console.error(`[webhook] ${event.event_type} ${event.id} failed:`, err);
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
