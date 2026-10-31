/**
 * First real PayPal sandbox call: create an order, approve it, capture it.
 * Run: npm run smoke:paypal            → creates an order and prints the approval link
 *      npm run smoke:paypal <orderId>  → captures it after you approve with the sandbox buyer
 */
import { captureOrder, createOrder } from "../src/lib/paypal/client";

const orderId = process.argv[2];
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

if (!orderId) {
  const order = await createOrder({
    amountCents: 2200,
    description: "Lavender soy candle (smoke test)",
    channel: "ai_agent",
    agentName: "smoke-test",
    brandName: "AgentShelf smoke test",
    returnUrl: `${appUrl}/checkout/return`,
    cancelUrl: `${appUrl}/checkout/cancel`,
  });
  console.log("Order created:", order.id, order.status);
  console.log("1. Approve it with the sandbox Personal account:", order.approveUrl);
  console.log(`2. Then run: npm run smoke:paypal ${order.id}`);
} else {
  const capture = await captureOrder(orderId);
  console.log("Captured:", capture);
}
