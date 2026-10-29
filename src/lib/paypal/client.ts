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

export async function captureOrder(orderId: string) {
  const { result } = await orders().captureOrder({ id: orderId, prefer: "return=representation" });
  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  const name = result.payer?.name;
  return {
    status: result.status,
    captureId: capture?.id,
    payerEmail: result.payer?.emailAddress,
    payerName: [name?.givenName, name?.surname].filter(Boolean).join(" ") || undefined,
  };
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
