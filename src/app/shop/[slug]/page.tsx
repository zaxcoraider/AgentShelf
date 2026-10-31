import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/app/seller/connect/widgets";
import { LogoMark } from "@/components/logo";
import { db, schema } from "@/lib/db";
import { requestBaseUrl } from "@/lib/base-url";
import { getShop, shippingCents, usd } from "@/lib/shop";
import { policyLines, productJsonLd, shopPolicy } from "@/lib/shop-facts";
import { BuyToggle, CheckoutProvider } from "./checkout";

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

  const p = shopPolicy(seller);
  const mcpUrl = `${baseUrl}/api/mcp/${seller.slug}`;
  // Quick facts for the hero, straight from the structured policy.
  const facts = p
    ? [
        `Ships in ${p.processingDays.min === p.processingDays.max ? p.processingDays.max : `${p.processingDays.min}–${p.processingDays.max}`} business days`,
        p.returnsDays > 0 ? `${p.returnsDays}-day returns` : "Final sale",
        "Pay with PayPal",
      ]
    : ["Pay with PayPal"];

  return (
    <div className="light min-h-screen bg-[#fbf8f3] text-stone-900 [color-scheme:light]">
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped can't break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="border-b border-stone-900/[0.06]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <p className="text-lg font-semibold tracking-tight">{seller.name}</p>
          <Link href="/" className="flex items-center gap-2 text-xs text-stone-500 transition-colors hover:text-stone-900">
            Powered by <LogoMark size={18} /> AgentShelf
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="py-14 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl">
            {seller.tagline ?? seller.name}
          </h1>
          <ul className="mt-8 flex flex-wrap gap-2">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full border border-stone-900/10 bg-white px-3.5 py-1.5 text-sm text-stone-700">
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <aside className="mb-12 flex flex-col gap-3 rounded-2xl border border-amber-900/10 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Shopping with Claude or ChatGPT?</p>
            <p className="text-sm text-stone-600">
              Add this shop to your assistant and it can browse, answer questions, and check out with PayPal for you.
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:max-w-sm">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-stone-900/10 bg-white px-3 py-2 font-mono text-xs">{mcpUrl}</code>
            <CopyButton text={mcpUrl} className="rounded-lg bg-stone-900 text-white hover:bg-stone-700" />
          </div>
        </aside>

        {!clientId && (
          <p role="alert" className="mb-6 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            Checkout is offline: PAYPAL_CLIENT_ID is not configured.
          </p>
        )}

        <CheckoutProvider clientId={clientId ?? ""}>
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const a = product.attributes;
              const details = [a.size, a.burnTime && `${a.burnTime} burn`].filter(Boolean).join(", ");
              return (
                <li key={product.id} className="flex flex-col">
                  <div className="overflow-hidden rounded-2xl bg-stone-100">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="aspect-[4/5] w-full object-cover transition duration-700 ease-out hover:scale-[1.03]"
                      />
                    ) : (
                      <CandlePlaceholder />
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-3">
                    <h2 className="font-medium">{product.title}</h2>
                    <p className="shrink-0 font-semibold">{usd(product.priceCents)}</p>
                  </div>
                  {a.scent && <p className="mt-1 text-sm text-stone-600">{a.scent}</p>}
                  {details && <p className="text-sm text-stone-500">{details}</p>}
                  <div className="mt-auto">
                    {product.stock > 0 && clientId ? (
                      <BuyToggle
                        slug={seller.slug}
                        productId={product.id}
                        priceCents={product.priceCents}
                        price={usd(product.priceCents)}
                        shippingCents={shippingCents(seller)}
                        stock={product.stock}
                      />
                    ) : (
                      <p className="mt-4 text-sm text-stone-500">{product.stock > 0 ? "Checkout unavailable" : "Sold out"}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CheckoutProvider>

        {policy.length > 0 && (
          <section aria-labelledby="policy" className="mt-24 grid gap-8 border-t border-stone-900/[0.08] pt-12 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="policy" className="text-2xl font-semibold tracking-tight">
                Shipping, returns, and materials
              </h2>
              <p className="mt-2 text-sm text-stone-500">AI assistants connected to this shop get exactly these facts.</p>
            </div>
            <ul className="divide-y divide-stone-900/[0.06] text-sm text-stone-700">
              {policy.map((line) => (
                <li key={line} className="py-3 first:pt-0">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-stone-900/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-8 text-sm text-stone-500 sm:px-6">
          <span>
            {seller.name}, {p?.shipsFrom ?? "an independent shop"}
          </span>
          <span>
            Payments by PayPal (sandbox). Shop built on{" "}
            <Link href="/" className="underline underline-offset-2 hover:text-stone-900">
              AgentShelf
            </Link>
            .
          </span>
        </div>
      </footer>
    </div>
  );
}

/** For products without a photo yet: a drawn candle on warm wax tones. */
function CandlePlaceholder() {
  return (
    <div aria-hidden className="flex aspect-[4/5] items-center justify-center bg-gradient-to-b from-amber-50 via-orange-50 to-stone-200">
      <svg viewBox="0 0 80 120" className="h-1/3 drop-shadow-[0_0_24px_rgba(245,158,11,0.45)]">
        <path d="M40 6c8 11 10 18 0 28-10-10-8-17 0-28Z" fill="#f59e0b" />
        <path d="M40 16c4 6 5 10 0 15-5-5-4-9 0-15Z" fill="#fde68a" />
        <rect x="38.5" y="32" width="3" height="8" rx="1.5" fill="#44403c" />
        <rect x="18" y="40" width="44" height="74" rx="8" fill="#fffaf2" stroke="#e7e5e4" />
      </svg>
    </div>
  );
}
