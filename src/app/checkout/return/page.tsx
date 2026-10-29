import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { completeCheckout, ShopError, usd } from "@/lib/shop";

// PayPal redirects here after the buyer approves: /checkout/return?token=<PayPal order id>&PayerID=...
// Capturing here is idempotent, so a refresh or a later webhook can't charge twice.
export const dynamic = "force-dynamic";

export default async function CheckoutReturn({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  let result: { ok: true; order: schema.Order } | { ok: false; message: string };
  if (!token) {
    result = { ok: false, message: "This link is missing the PayPal order reference." };
  } else {
    try {
      result = { ok: true, order: await completeCheckout(token) };
    } catch (err) {
      console.error("[checkout] capture failed:", err);
      result = {
        ok: false,
        message: err instanceof ShopError ? err.message : "PayPal couldn't complete the payment. You have not been charged.",
      };
    }
  }

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Payment not completed</h1>
        <p className="mt-2">{result.message}</p>
      </main>
    );
  }

  const { order } = result;
  const [seller, product] = await Promise.all([
    db.query.sellers.findFirst({ where: eq(schema.sellers.id, order.sellerId) }),
    order.productId ? db.query.products.findFirst({ where: eq(schema.products.id, order.productId) }) : undefined,
  ]);

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Payment complete</h1>
      <p className="mt-2">
        Thanks{order.buyerName ? `, ${order.buyerName.split(" ")[0]}` : ""}! {seller?.name} has your order
        {product ? ` for ${product.title}${order.quantity > 1 ? ` x${order.quantity}` : ""}` : ""}.
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="opacity-70">Total paid</dt>
        <dd>{usd(order.amountCents)}</dd>
        <dt className="opacity-70">Order</dt>
        <dd className="font-mono text-xs">{order.id}</dd>
        <dt className="opacity-70">PayPal order</dt>
        <dd className="font-mono text-xs">{order.paypalOrderId}</dd>
      </dl>
      {order.channel === "ai_agent" && (
        <p className="mt-6 text-sm opacity-70">You can close this tab and go back to {order.agentName ?? "your assistant"}.</p>
      )}
    </main>
  );
}
