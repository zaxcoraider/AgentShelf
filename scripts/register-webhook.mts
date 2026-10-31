/**
 * Register this app's PayPal webhook for a deployed URL, or reuse the one already registered there.
 * Prints the webhook id to set as PAYPAL_WEBHOOK_ID on the host.
 *
 * Run: npm run paypal:webhook -- https://your-app.onrender.com
 */
import { paypalGet, paypalPost } from "../src/lib/paypal/client";

// The events src/lib/paypal/webhooks.ts handles.
const EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
];

const base = process.argv[2];
if (!base?.startsWith("https://")) {
  console.error("Pass the deployed https URL, e.g. npm run paypal:webhook -- https://your-app.onrender.com");
  process.exit(1);
}
const url = `${base.replace(/\/$/, "")}/api/webhooks/paypal`;

type Webhook = { id: string; url: string; event_types: { name: string }[] };
const { webhooks } = await paypalGet<{ webhooks: Webhook[] }>("/v1/notifications/webhooks");
const existing = webhooks.find((w) => w.url === url);
const webhook =
  existing ?? (await paypalPost<Webhook>("/v1/notifications/webhooks", { url, event_types: EVENTS.map((name) => ({ name })) }));

console.log(`${existing ? "Already registered" : "Registered"}: ${webhook.url}`);
console.log(`Events: ${webhook.event_types.map((e) => e.name).join(", ")}`);
console.log(`\nPAYPAL_WEBHOOK_ID=${webhook.id}`);
