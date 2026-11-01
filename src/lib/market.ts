import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { cancelSubscription, marketPrices, subscribeToPrice, type PriceChangedEvent } from "./channel3";
import { db, schema } from "./db";
import type { MarketComparable, Product } from "./db/schema";
import { usd } from "./money";

/**
 * Market watch. Each product's photo finds similar products for sale (Channel3 image search); we keep
 * the most typical few and subscribe to their price changes (Channel3 product subscriptions, free).
 * When a store changes a price, Channel3's webhook updates the comparable and the seller agent's log
 * records it, so the seller sees "similar mugs dropped to a $38 median" without checking anything.
 */

const MAX_COMPARABLES = 6;

export type MarketSummary = {
  count: number;
  lowCents: number;
  medianCents: number;
  highCents: number;
  /** How the seller's price compares with the median, in percent (+12 = 12% above). */
  vsMedianPct: number;
  comparables: MarketComparable[];
  checkedAt: Date | null;
};

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarize(product: Pick<Product, "priceCents" | "marketCheckedAt">, comparables: MarketComparable[]): MarketSummary | null {
  if (comparables.length < 3) return null;
  const prices = comparables.map((c) => c.priceCents).sort((a, b) => a - b);
  const med = median(prices);
  return {
    count: comparables.length,
    lowCents: prices[0],
    medianCents: med,
    highCents: prices[prices.length - 1],
    vsMedianPct: Math.round(((product.priceCents - med) / med) * 100),
    comparables: [...comparables].sort((a, b) => Math.abs(a.priceCents - med) - Math.abs(b.priceCents - med)),
    checkedAt: product.marketCheckedAt,
  };
}

/** Market summaries for these products (those with enough comparables). */
export async function marketFor(products: Pick<Product, "id" | "priceCents" | "marketCheckedAt">[]) {
  if (!products.length) return new Map<string, MarketSummary>();
  const rows = await db.query.marketComparables.findMany({
    where: inArray(
      schema.marketComparables.productId,
      products.map((p) => p.id),
    ),
  });
  const out = new Map<string, MarketSummary>();
  for (const p of products) {
    const s = summarize(
      p,
      rows.filter((r) => r.productId === p.id),
    );
    if (s) out.set(p.id, s);
  }
  return out;
}

export type RefreshResult = { status: "ok" | "few" | "off" | "error" | "no_photo"; comparables?: number };

/** Look up one product's market from its photo, replace its comparables, and subscribe to their prices. */
export async function refreshProductMarket(productId: string): Promise<RefreshResult> {
  const [image, product] = await Promise.all([
    db.query.productImages.findFirst({ where: eq(schema.productImages.productId, productId) }),
    db.query.products.findFirst({ where: eq(schema.products.id, productId) }),
  ]);
  if (!image || !product) return { status: "no_photo" };
  // Name + key detail + photo: precise matches ("candle", not the lamp in the shot).
  const query = [product.title, product.attributes.size].filter(Boolean).join(", ");
  const lookup = await marketPrices({ data: image.data }, { query });
  if (lookup.status !== "ok") {
    if (lookup.status === "few") {
      await db.update(schema.products).set({ marketCheckedAt: new Date() }).where(eq(schema.products.id, productId));
    }
    return { status: lookup.status };
  }

  const picks = lookup.market.comparables.slice(0, MAX_COMPARABLES);
  const old = await db.query.marketComparables.findMany({ where: eq(schema.marketComparables.productId, productId) });
  // Keep subscriptions for comparables we still track; cancel the rest.
  const keep = new Set(picks.map((c) => `${c.id}|${c.store}`));
  await Promise.all(old.filter((o) => o.subscriptionId && !keep.has(`${o.channel3ProductId}|${o.store}`)).map((o) => cancelSubscription(o.subscriptionId!)));
  const subscriptions = await Promise.all(picks.map((c) => subscribeToPrice(c.id, c.store)));

  await db.transaction(async (tx) => {
    await tx.delete(schema.marketComparables).where(eq(schema.marketComparables.productId, productId));
    await tx.insert(schema.marketComparables).values(
      picks.map((c, i) => ({
        productId,
        channel3ProductId: c.id,
        title: c.title.slice(0, 200),
        brand: c.brand,
        store: c.store,
        url: c.url,
        imageUrl: c.image,
        priceCents: Math.round(c.priceUsd * 100),
        subscriptionId: subscriptions[i],
      })),
    );
    await tx.update(schema.products).set({ marketCheckedAt: new Date() }).where(eq(schema.products.id, productId));
  });
  return { status: "ok", comparables: picks.length };
}

/**
 * Refresh a shop's products, one at a time (1 Channel3 credit each). `onlyNew` skips products already
 * checked, so it's cheap to call after creating a shop or on every deploy.
 */
export async function refreshShopMarket(sellerId: string, opts: { onlyNew?: boolean; max?: number } = {}) {
  const products = await db.query.products.findMany({
    where: and(
      eq(schema.products.sellerId, sellerId),
      eq(schema.products.active, true),
      isNotNull(schema.products.imageUrl),
      opts.onlyNew ? isNull(schema.products.marketCheckedAt) : undefined,
    ),
    limit: opts.max ?? 20,
  });
  const results: Record<string, RefreshResult> = {};
  for (const p of products) results[p.title] = await refreshProductMarket(p.id);
  return results;
}

/** Run without making the caller wait (after publishing a product or creating a shop). */
export function refreshInBackground(work: () => Promise<unknown>) {
  if (!process.env.CHANNEL3_API_KEY) return;
  void work().catch((err) => console.warn("[market] background refresh failed:", err));
}

/**
 * A Channel3 price change: update the matching comparables and note it in each affected seller's
 * agent log, with where the market now sits against their own price. Returns how many products moved.
 */
export async function applyPriceChange(event: PriceChangedEvent) {
  const { product_id, domain } = event.data.subject;
  if (event.data.current.currency !== "USD") return 0;
  const priceCents = Math.round(event.data.current.price * 100);
  const rows = await db.query.marketComparables.findMany({
    where: and(eq(schema.marketComparables.channel3ProductId, product_id), eq(schema.marketComparables.store, domain)),
  });
  let moved = 0;
  for (const row of rows) {
    if (row.priceCents === priceCents) continue;
    await db
      .update(schema.marketComparables)
      .set({ previousPriceCents: row.priceCents, priceCents, priceChangedAt: new Date(event.timestamp) })
      .where(eq(schema.marketComparables.id, row.id));
    const product = await db.query.products.findFirst({ where: eq(schema.products.id, row.productId) });
    if (!product) continue;
    const comparables = await db.query.marketComparables.findMany({ where: eq(schema.marketComparables.productId, product.id) });
    const s = summarize(product, comparables);
    const direction = priceCents < row.priceCents ? "dropped" : "rose";
    await db.insert(schema.agentActions).values({
      sellerId: product.sellerId,
      tool: "market_watch",
      status: "auto",
      input: { productId: product.id, comparable: row.title, store: domain, from: row.priceCents, to: priceCents },
      reason:
        `${row.title} at ${domain} ${direction} from ${usd(row.priceCents)} to ${usd(priceCents)}.` +
        (s
          ? ` Similar products to your ${product.title} now sell for a ${usd(s.medianCents)} median; yours is ${usd(product.priceCents)} (${s.vsMedianPct >= 0 ? "+" : ""}${s.vsMedianPct}%).`
          : ""),
    });
    moved++;
  }
  return moved;
}
