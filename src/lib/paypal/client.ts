import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  PaypalExperienceUserAction,
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
  return { status: result.status, captureId: capture?.id, payerEmail: result.payer?.emailAddress };
}
