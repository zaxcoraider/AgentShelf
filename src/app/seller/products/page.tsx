import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import { marketFor } from "@/lib/market";
import { canEditShop, requireSeller } from "@/lib/seller-session";
import { CheckMarket } from "./check-market";
import { ProductRow, type EditableProduct } from "./product-row";

// The seller's catalog: edit details, price and stock, hide from sale, or delete.
export const dynamic = "force-dynamic";

export default async function Products() {
  const seller = await requireSeller();
  const editable = canEditShop(seller);
  const [products, orderCounts] = await Promise.all([
    db.query.products.findMany({
      where: eq(schema.products.sellerId, seller.id),
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    }),
    db
      .select({ productId: schema.orders.productId, n: count() })
      .from(schema.orders)
      .where(eq(schema.orders.sellerId, seller.id))
      .groupBy(schema.orders.productId),
  ]);
  const orders = new Map(orderCounts.map((o) => [o.productId, o.n]));
  const market = await marketFor(products);
  const rows: EditableProduct[] = products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    scent: p.attributes.scent ?? "",
    size: p.attributes.size ?? "",
    priceCents: p.priceCents,
    stock: p.stock,
    active: p.active,
    imageUrl: p.imageUrl,
    orders: orders.get(p.id) ?? 0,
    market: (() => {
      const m = market.get(p.id);
      return m
        ? {
            lowCents: m.lowCents,
            medianCents: m.medianCents,
            highCents: m.highCents,
            vsMedianPct: m.vsMedianPct,
            comparables: m.comparables.map((c) => ({
              title: c.title,
              store: c.store,
              url: c.url,
              imageUrl: c.imageUrl,
              priceCents: c.priceCents,
              previousPriceCents: c.previousPriceCents,
            })),
          }
        : null;
    })(),
  }));
  const onSale = rows.filter((r) => r.active && r.stock > 0).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-smoke">
            {rows.length} product{rows.length === 1 ? "" : "s"}, {onSale} on sale. Changes reach your storefront and AI
            assistants straight away.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {process.env.CHANNEL3_API_KEY && rows.length > 0 && <CheckMarket />}
        <Link
          href="/seller/listings"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-wax transition-colors hover:bg-amber-400"
        >
          <span aria-hidden>+</span> Add products
        </Link>
        </div>
      </div>

      {!editable && (
        <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100/90">
          The demo shop is read-only so every judge sees the same demo.{" "}
          <Link href="/start" className="text-amber-300 underline-offset-2 hover:underline">
            Create your own shop
          </Link>{" "}
          to try editing.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
          <p className="text-cream">No products yet</p>
          <p className="mt-1 text-sm text-smoke">Add a photo and AI drafts the listing for you.</p>
          <Link href="/seller/listings" className="mt-5 inline-block text-sm text-amber-300 hover:text-amber-200">
            Add your first product →
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((p) => (
            <ProductRow key={p.id} product={p} editable={editable} />
          ))}
        </ul>
      )}
    </main>
  );
}
