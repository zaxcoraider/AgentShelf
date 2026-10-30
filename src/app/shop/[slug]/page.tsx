import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getShop, SHIPPING_CENTS, usd } from "@/lib/shop";
import { BuyButtons, CheckoutProvider } from "./checkout";

// Public storefront for human buyers. AI buyers use the same catalog through /api/mcp/<slug>.
export const dynamic = "force-dynamic";

export default async function Storefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seller = await getShop(slug);
  if (!seller) notFound();

  const products = await db.query.products.findMany({
    where: and(eq(schema.products.sellerId, seller.id), eq(schema.products.active, true)),
    orderBy: asc(schema.products.priceCents),
  });
  const clientId = process.env.PAYPAL_CLIENT_ID;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{seller.name}</h1>
        <p className="mt-1 opacity-70">{seller.tagline}</p>
      </header>

      {!clientId && (
        <p role="alert" className="mt-6 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Checkout is offline: PAYPAL_CLIENT_ID is not configured.
        </p>
      )}

      <CheckoutProvider clientId={clientId ?? ""}>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id} className="flex flex-col rounded-xl border border-stone-200 p-5 dark:border-stone-800">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route
                <img src={p.imageUrl} alt={p.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
              ) : (
                <div
                  aria-hidden
                  className="flex aspect-[4/3] items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-stone-200 text-4xl dark:from-amber-950 dark:to-stone-900"
                >
                  🕯️
                </div>
              )}
              <h2 className="mt-4 font-medium">{p.title}</h2>
              <p className="mt-1 text-sm opacity-70">{p.attributes.scent}</p>
              <p className="mt-2 text-lg">{usd(p.priceCents)}</p>
              {p.stock > 0 && clientId ? (
                <BuyButtons
                  slug={seller.slug}
                  productId={p.id}
                  priceCents={p.priceCents}
                  shippingCents={SHIPPING_CENTS}
                  stock={p.stock}
                />
              ) : (
                <p className="mt-4 text-sm opacity-60">{p.stock > 0 ? "Checkout unavailable" : "Sold out"}</p>
              )}
            </li>
          ))}
        </ul>
      </CheckoutProvider>
    </main>
  );
}
