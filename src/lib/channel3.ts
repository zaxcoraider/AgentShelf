/**
 * Channel3 (trychannel3.com): a catalog of products for sale across the web, searchable by image.
 * AgentShelf uses it when a seller adds a product from a photo: the photo finds similar products,
 * and their current prices give the seller (and the listing AI) a real market range.
 *
 * Docs: https://docs.trychannel3.com (POST /v1/image-search, x-api-key header).
 */

const API = "https://api.trychannel3.com/v1";
const TIMEOUT_MS = 8000;

export type Comparable = {
  /** Channel3's canonical product id (for product subscriptions). */
  id: string;
  title: string;
  brand: string | null;
  priceUsd: number;
  store: string;
  url: string;
  image: string | null;
};

export type MarketPrices = {
  comparables: Comparable[];
  /** Over the comparables' lowest USD offer each. */
  lowUsd: number;
  medianUsd: number;
  highUsd: number;
};

export const channel3Configured = () => Boolean(process.env.CHANNEL3_API_KEY);

type C3Product = {
  id: string;
  title: string;
  brands?: { name: string }[];
  images?: { url: string; cleaned_url?: string | null; is_main_image?: boolean }[];
  offers?: { url: string; domain: string; price: { price: number; currency: string } }[];
};

/** What a market lookup found, so the seller sees why there is (or isn't) a market range. */
export type MarketLookup =
  | { status: "ok"; market: MarketPrices }
  | { status: "few"; found: number; priced: number }
  | { status: "off" }
  | { status: "error" };

/**
 * Similar products for sale, found from the product photo. Never throws: listing works without it,
 * and the result says whether Channel3 is off, failed, or found too few priced matches.
 */
export async function marketPrices(image: { data: Buffer | Uint8Array }, opts: { query?: string } = {}): Promise<MarketLookup> {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return { status: "off" };
  const started = Date.now();
  try {
    // With a product name, search by name + photo (POST /v1/search): the photo alone can match whatever
    // else is in the shot (a lamp behind a candle). Without one (a brand-new listing), photo only.
    const res = await fetch(`${API}/${opts.query ? "search" : "image-search"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      // Buffer.from: photos read back from Postgres can arrive as a plain Uint8Array, whose toString isn't base64.
      body: JSON.stringify({
        ...(opts.query ? { query: opts.query } : {}),
        base64_image: Buffer.from(image.data).toString("base64"),
        limit: 12,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[channel3] image search failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return { status: "error" };
    }
    const { products = [] } = (await res.json()) as { products?: C3Product[] };
    const market = summarize(products);
    const priced = products.filter((p) => p.offers?.some((o) => o.price?.currency === "USD" && o.price.price > 0)).length;
    console.log(`[channel3] ${products.length} matches, ${priced} priced in USD, ${Date.now() - started} ms`);
    return market ? { status: "ok", market } : { status: "few", found: products.length, priced };
  } catch (err) {
    console.warn("[channel3] image search error:", err instanceof Error ? err.message : err);
    return { status: "error" };
  }
}

/** Each product's cheapest USD offer, then the low / median / high across products. Exported for tests. */
export function summarize(products: C3Product[]): MarketPrices | null {
  const comparables: Comparable[] = [];
  for (const p of products) {
    const offers = (p.offers ?? []).filter((o) => o.price?.currency === "USD" && o.price.price > 0);
    if (!offers.length) continue;
    const best = offers.reduce((a, b) => (b.price.price < a.price.price ? b : a));
    const img = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
    comparables.push({
      id: p.id,
      title: p.title,
      brand: p.brands?.[0]?.name ?? null,
      priceUsd: Math.round(best.price.price * 100) / 100,
      store: best.domain,
      url: best.url,
      image: img ? (img.cleaned_url ?? img.url) : null,
    });
  }
  if (comparables.length < 3) return null;
  const prices = comparables.map((c) => c.priceUsd).sort((a, b) => a - b);
  // Trim the extremes when there are enough points, so one luxury or clearance listing doesn't skew the range.
  const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
  const mid = Math.floor(trimmed.length / 2);
  const median = trimmed.length % 2 ? trimmed[mid] : (trimmed[mid - 1] + trimmed[mid]) / 2;
  // Show the most typical matches: closest to the median first, so a luxury set or clearance item isn't the example.
  const typical = [...comparables].sort((a, b) => Math.abs(a.priceUsd - median) - Math.abs(b.priceUsd - median));
  return {
    comparables: typical.slice(0, 6),
    lowUsd: trimmed[0],
    medianUsd: Math.round(median * 100) / 100,
    highUsd: trimmed[trimmed.length - 1],
  };
}

/** One paragraph for the listing AI's prompt. */
export function marketContext(m: MarketPrices) {
  return [
    `Similar products currently for sale online (Channel3): ${m.comparables.length}+ matches,`,
    `typical price $${m.lowUsd.toFixed(2)}–$${m.highUsd.toFixed(2)}, median $${m.medianUsd.toFixed(2)}.`,
    "Examples:",
    ...m.comparables.map((c) => `- ${c.title}${c.brand ? ` (${c.brand})` : ""}: $${c.priceUsd.toFixed(2)} at ${c.store}`),
    "A handmade item from a small shop can sit at or above the median; explain the price against this range and the shop's own prices.",
  ].join("\n");
}

// ---------- Market watch: product subscriptions + webhooks ----------

/**
 * Subscribe to price changes for one comparable at one store. Free on Channel3; idempotent (an
 * identical active subscription is returned as-is). Returns the subscription id, or null on failure.
 */
export async function subscribeToPrice(channel3ProductId: string, store: string): Promise<string | null> {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${API}/product-subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ product_id: channel3ProductId, events: ["offer.price.changed"], domains: [store] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[channel3] subscribe failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const sub = (await res.json()) as { subscription_id?: string };
    return sub.subscription_id ?? null;
  } catch (err) {
    console.warn("[channel3] subscribe error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Cancel a subscription (when a product's comparables are replaced). Best effort. */
export async function cancelSubscription(subscriptionId: string) {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return;
  await fetch(`${API}/product-subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => undefined);
}

export type PriceChangedEvent = {
  id: string;
  type: "offer.price.changed";
  timestamp: string;
  data: {
    subscription_id: string;
    subject: { product_id: string; domain: string };
    previous: { price: number; currency: string };
    current: { price: number; currency: string };
  };
};

/**
 * Verify a Channel3 webhook (Standard Webhooks / Svix): HMAC-SHA256 over "id.timestamp.body" with the
 * base64 secret after "whsec_", compared in constant time; timestamps over 5 minutes off are rejected.
 */
export async function verifyChannel3Webhook(headers: Headers, body: string, secret = process.env.CHANNEL3_WEBHOOK_SECRET) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatures) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
