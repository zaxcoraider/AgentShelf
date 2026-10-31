import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/lib/db";
import { requestBaseUrl } from "@/lib/base-url";
import { getShop, shippingCents, usd } from "@/lib/shop";
import { policyLines, productJsonLd } from "@/lib/shop-facts";
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
  const baseUrl = await requestBaseUrl();
  // Same facts the MCP server gives assistants, as schema.org data for crawlers and AI browsing.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: seller.name,
    itemListElement: products.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: productJsonLd(seller, p, baseUrl) })),
  };
  const policy = policyLines(seller);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped can't break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
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
                  shippingCents={shippingCents(seller)}
                  stock={p.stock}
                />
              ) : (
                <p className="mt-4 text-sm opacity-60">{p.stock > 0 ? "Checkout unavailable" : "Sold out"}</p>
              )}
            </li>
          ))}
        </ul>
      </CheckoutProvider>

      {policy.length > 0 && (
        <section aria-labelledby="policy" className="mt-12 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
          <h2 id="policy" className="font-medium">
            Shipping, returns, and materials
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm opacity-80">
            {policy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs opacity-60">AI assistants connected to this shop get exactly these facts.</p>
        </section>
      )}
    </main>
  );
}
