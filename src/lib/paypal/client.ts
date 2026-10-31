import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  PaypalExperienceUserAction,
  ShipmentCarrier,
} from "@paypal/paypal-server-sdk";

/** PayPal REST client (sandbox only). The SDK handles OAuth and token refresh. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

if (process.env.PAYPAL_ENVIRONMENT && process.env.PAYPAL_ENVIRONMENT !== "sandbox") {
  throw new Error("AgentShelf runs against the PayPal sandbox only.");
}

let client: Client | null = null;

export function paypalClient(): Client {
  client ??= new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: required("PAYPAL_CLIENT_ID"),
      oAuthClientSecret: required("PAYPAL_CLIENT_SECRET"),
    },
    environment: Environment.Sandbox,
  });
  return client;
}

export const orders = () => new OrdersController(paypalClient());
export const payments = () => new PaymentsController(paypalClient());

export type CheckoutChannel = "ai_agent" | "human";

/** Create a capture-intent order. `custom_id` records which channel (and agent) the sale came from. */
export async function createOrder(opts: {
  amountCents: number;
  description: string;
  channel: CheckoutChannel;
  agentName?: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const { result } = await orders().createOrder({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          amount: { currencyCode: "USD", value: (opts.amountCents / 100).toFixed(2) },
          description: opts.description.slice(0, 127),
          customId: [opts.channel, opts.agentName].filter(Boolean).join(":").slice(0, 127),
        },
      ],
      paymentSource: {
        paypal: {
          experienceContext: {
            returnUrl: opts.returnUrl,
            cancelUrl: opts.cancelUrl,
            userAction: PaypalExperienceUserAction.PayNow,
          },
        },
      },
    },
    prefer: "return=representation",
  });
  const approveUrl = result.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { id: result.id!, status: result.status, approveUrl };
}

type PaypalOrder = Awaited<ReturnType<OrdersController["getOrder"]>>["result"];

/** The parts of a PayPal order we store once it's paid. */
function paymentSummary(order: PaypalOrder) {
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  const name = order.payer?.name;
  return {
    status: order.status,
    captureId: capture?.id,
    payerEmail: order.payer?.emailAddress,
    payerName: [name?.givenName, name?.surname].filter(Boolean).join(" ") || undefined,
  };
}

export async function captureOrder(orderId: string) {
  const { result } = await orders().captureOrder({ id: orderId, prefer: "return=representation" });
  return paymentSummary(result);
}

/** Read an order without changing it (e.g. to see whether someone else already captured it). */
export async function getOrderPayment(orderId: string) {
  const { result } = await orders().getOrder({ id: orderId });
  return paymentSummary(result);
}

const API_BASE = "https://api-m.sandbox.paypal.com";
let token: { value: string; expiresAt: number } | null = null;

/** OAuth token for the few REST calls the server SDK doesn't cover (webhook verification). */
async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${required("PAYPAL_CLIENT_ID")}:${required("PAYPAL_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

/** GET a PayPal REST endpoint with our app's token. */
export async function paypalGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** POST to a PayPal REST endpoint with our app's token. */
export async function paypalPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const money = (cents: number) => ({ currencyCode: "USD", value: (cents / 100).toFixed(2) });

/**
 * Refund a captured payment (full when `amountCents` is omitted).
 * `requestId` makes the call idempotent: PayPal returns the same refund if it is retried.
 */
export async function refundCapture(opts: {
  captureId: string;
  amountCents?: number;
  note?: string;
  requestId: string;
}) {
  const { result } = await payments().refundCapturedPayment({
    captureId: opts.captureId,
    paypalRequestId: opts.requestId,
    prefer: "return=representation",
    body: {
      amount: opts.amountCents != null ? money(opts.amountCents) : undefined,
      noteToPayer: opts.note?.slice(0, 255),
    },
  });
  return { refundId: result.id, status: result.status };
}

export const CARRIERS = { USPS: ShipmentCarrier.Usps, UPS: ShipmentCarrier.Ups, FEDEX: ShipmentCarrier.Fedex, DHL: ShipmentCarrier.Dhl };
export type Carrier = keyof typeof CARRIERS;

/** Attach shipment tracking to a PayPal order so the buyer sees it in PayPal. */
export async function addOrderTracking(opts: {
  paypalOrderId: string;
  captureId: string;
  carrier: Carrier;
  trackingNumber: string;
}) {
  const { result } = await orders().createOrderTracking({
    id: opts.paypalOrderId,
    body: {
      captureId: opts.captureId,
      carrier: CARRIERS[opts.carrier],
      trackingNumber: opts.trackingNumber,
      notifyPayer: true,
    },
  });
  return { status: result.status };
}
