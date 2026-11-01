import { eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBar } from "@/app/shop/demo-bar";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
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
      <Shell>
        <Card>
          <span className="grid size-11 place-items-center rounded-full bg-red-50 text-red-600" aria-hidden>
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-.9 4h1.8v5H9.1V6zm0 6.5h1.8v1.8H9.1v-1.8z" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Payment not completed</h1>
          <p className="mt-2 text-stone-600">{result.message}</p>
          <Actions shopHref={`/shop/${DEMO_SELLER_SLUG}`} shopName="the shop" />
        </Card>
      </Shell>
    );
  }

  const { order } = result;
  const [seller, product] = await Promise.all([
    db.query.sellers.findFirst({ where: eq(schema.sellers.id, order.sellerId) }),
    order.productId ? db.query.products.findFirst({ where: eq(schema.products.id, order.productId) }) : undefined,
  ]);

  return (
    <Shell>
      <Card>
        <span className="grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden>
          <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
            <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Payment complete</h1>
        <p className="mt-2 text-stone-600">
          Thanks{order.buyerName ? `, ${order.buyerName.split(" ")[0]}` : ""}! {seller?.name} has your order
          {product ? ` for ${product.title}${order.quantity > 1 ? ` ×${order.quantity}` : ""}` : ""}.
        </p>
        <dl className="mt-6 divide-y divide-stone-900/[0.06] rounded-xl border border-stone-900/[0.08] bg-stone-50/60 text-sm">
          <Row label="Total paid">
            <span className="font-medium">{usd(order.amountCents)}</span>
          </Row>
          <Row label="Order">
            <span className="font-mono text-xs">{order.id.slice(0, 8)}</span>
          </Row>
          <Row label="PayPal order">
            <span className="font-mono text-xs">{order.paypalOrderId}</span>
          </Row>
        </dl>
        {order.channel === "ai_agent" && (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can close this tab and go back to {order.agentName ?? "your assistant"}. It can confirm the payment for you.
          </p>
        )}
        <Actions shopHref={seller ? `/shop/${seller.slug}` : "/"} shopName={seller?.name ?? "the shop"} />
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="light min-h-screen bg-[#fbf8f3] text-stone-900 [color-scheme:light]">
      <DemoBar />
      <main className="mx-auto flex max-w-6xl justify-center px-4 py-16 sm:py-24">{children}</main>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-900/[0.08] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Actions({ shopHref, shopName }: { shopHref: string; shopName: string }) {
  return (
    <div className="mt-7 flex flex-wrap gap-2">
      <Link
        href={shopHref}
        className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
      >
        <span aria-hidden>←</span> Back to {shopName}
      </Link>
      <Link
        href="/"
        className="inline-flex items-center rounded-full border border-stone-900/10 px-4 py-2 text-sm text-stone-700 transition-colors hover:border-stone-900/25 hover:text-stone-900"
      >
        AgentShelf home
      </Link>
    </div>
  );
}
