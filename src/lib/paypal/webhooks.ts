import { X509Certificate, verify } from "node:crypto";
import { crc32 } from "node:zlib";
import { paypalPost } from "./client";

/**
 * PayPal webhooks: signature verification and turning raw events into the few facts
 * AgentShelf acts on. No database access here; see `src/lib/webhooks.ts` for that.
 */

export type PaypalEvent = {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: Record<string, unknown>;
};

const CERT_HOSTS = new Set(["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"]);
const certs = new Map<string, Promise<X509Certificate>>();

/** Download PayPal's signing cert, only from PayPal's own hosts (the URL comes from the request). */
function signingCert(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !CERT_HOSTS.has(parsed.hostname)) {
    return Promise.reject(new Error(`Untrusted cert URL ${parsed.hostname}`));
  }
  let cert = certs.get(url);
  if (!cert) {
    cert = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Cert download failed: ${res.status}`);
        return res.text();
      })
      .then((pem) => new X509Certificate(pem));
    cert.catch(() => certs.delete(url));
    certs.set(url, cert);
  }
  return cert;
}

/**
 * Check that a webhook really came from PayPal for our webhook id. Verifies the signature
 * locally (transmission id | time | webhook id | CRC32 of the raw body, RSA-SHA256), and
 * falls back to PayPal's verify-webhook-signature API if that fails.
 */
export async function verifyWebhook(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const signature = headers.get("paypal-transmission-sig");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !signature || !certUrl || !authAlgo) return false;

  try {
    const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(Buffer.from(rawBody))}`;
    const cert = await signingCert(certUrl);
    if (verify("sha256", Buffer.from(message), cert.publicKey, Buffer.from(signature, "base64"))) return true;
  } catch (err) {
    console.warn("[webhook] local signature check failed:", err);
  }

  try {
    const result = await paypalPost<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: signature,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    });
    return result.verification_status === "SUCCESS";
  } catch (err) {
    console.warn("[webhook] PayPal verification call failed:", err);
    return false;
  }
}

/** What an event means for us. Everything else is acknowledged and ignored. */
export type WebhookIntent =
  | { kind: "order_approved"; paypalOrderId: string }
  | { kind: "capture_completed"; captureId: string; paypalOrderId?: string }
  | { kind: "capture_refunded"; captureId: string; refundCents?: number; totalRefundedCents?: number }
  | {
      kind: "dispute";
      disputeId: string;
      captureIds: string[];
      reason?: string;
      status: string;
      amountCents?: number;
      responseDueAt?: Date;
    }
  | { kind: "ignored" };

type Money = { value?: string } | undefined;
type Link = { rel?: string; href?: string };

const cents = (money: Money) => (money?.value != null ? Math.round(Number(money.value) * 100) : undefined);
const date = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined);

/** The capture a refund belongs to, from its `up` link (…/v2/payments/captures/{id}). */
function refundedCaptureId(refund: Record<string, unknown>) {
  const up = (refund.links as Link[] | undefined)?.find((l) => l.rel === "up")?.href;
  return up?.match(/\/captures\/([^/?]+)/)?.[1];
}

export function interpretEvent(event: PaypalEvent): WebhookIntent {
  const r = event.resource ?? {};
  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED":
      return typeof r.id === "string" ? { kind: "order_approved", paypalOrderId: r.id } : { kind: "ignored" };

    case "PAYMENT.CAPTURE.COMPLETED": {
      if (typeof r.id !== "string") return { kind: "ignored" };
      const related = (r.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      return { kind: "capture_completed", captureId: r.id, paypalOrderId: related?.order_id };
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      const captureId = refundedCaptureId(r);
      if (!captureId) return { kind: "ignored" };
      const breakdown = r.seller_payable_breakdown as { total_refunded_amount?: Money } | undefined;
      return {
        kind: "capture_refunded",
        captureId,
        refundCents: cents(r.amount as Money),
        totalRefundedCents: cents(breakdown?.total_refunded_amount),
      };
    }

    case "CUSTOMER.DISPUTE.CREATED":
    case "CUSTOMER.DISPUTE.UPDATED":
    case "CUSTOMER.DISPUTE.RESOLVED": {
      if (typeof r.dispute_id !== "string") return { kind: "ignored" };
      const transactions = (r.disputed_transactions as { seller_transaction_id?: string }[] | undefined) ?? [];
      return {
        kind: "dispute",
        disputeId: r.dispute_id,
        captureIds: transactions.map((t) => t.seller_transaction_id).filter((id): id is string => !!id),
        reason: typeof r.reason === "string" ? r.reason : undefined,
        status: typeof r.status === "string" ? r.status : event.event_type === "CUSTOMER.DISPUTE.RESOLVED" ? "RESOLVED" : "OPEN",
        amountCents: cents(r.dispute_amount as Money),
        responseDueAt: date(r.seller_response_due_date),
      };
    }

    default:
      return { kind: "ignored" };
  }
}
