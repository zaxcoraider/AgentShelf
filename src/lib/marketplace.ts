import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Product, Seller } from "./db/schema";
import { publicProduct, rankProducts, shippingCents, usd } from "./shop";
import { shopPolicy } from "./shop-facts";

/**
 * The AgentShelf marketplace: every listed shop behind one MCP connector. A shop is listed when it
 * hasn't opted out, hasn't expired, and has at least one product on sale. Products and orders have
 * globally unique ids, so buying, order status and refunds find their own shop; each shop's facts,
 * rules and agent still apply exactly as on its own MCP server.
 */

const listedSellers = () =>
  and(
    eq(schema.sellers.marketplace, true),
    or(isNull(schema.sellers.expiresAt), gt(schema.sellers.expiresAt, new Date())),
  );

/** How a shop is introduced in marketplace results. */
export function shopCard(seller: Seller) {
  const p = shopPolicy(seller);
  return {
    name: seller.name,
    shop: seller.slug,
    tagline: seller.tagline ?? undefined,
    shipsFrom: p?.shipsFrom,
    shipsTo: p?.shipsTo,
    shipping: shippingCents(seller) ? usd(shippingCents(seller)) : "free",
    /** Shops made by visitors on /start are demos; the showcase shop is the seeded demo seller. */
    demo: seller.visitor,
  };
}

/** Listed shops that have something on sale, newest products' shops first. */
export async function listedShops() {
  const rows = await db
    .select({ seller: schema.sellers, products: sql<number>`count(${schema.products.id})::int` })
    .from(schema.sellers)
    .innerJoin(schema.products, and(eq(schema.products.sellerId, schema.sellers.id), eq(schema.products.active, true)))
    .where(listedSellers())
    .groupBy(schema.sellers.id);
  return rows.map((r) => ({ seller: r.seller, products: Number(r.products) }));
}

/** A listed shop by slug or name (assistants may pass either). */
export async function findListedShop(ref: string) {
  const text = ref.trim();
  const slug = text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return db.query.sellers.findFirst({
    where: and(listedSellers(), or(eq(schema.sellers.slug, slug), sql`lower(${schema.sellers.name}) = ${text.toLowerCase()}`)),
  });
}

/** Search across every listed shop; each result says which shop sells it. */
export async function searchMarketplace(opts: { query?: string; maxPriceCents?: number; shop?: string; limit?: number }) {
  const shops = opts.shop ? [await findListedShop(opts.shop)].filter((s): s is Seller => Boolean(s)) : (await listedShops()).map((s) => s.seller);
  if (!shops.length) return [];
  const bySeller = new Map(shops.map((s) => [s.id, s]));
  const filters = [inArray(schema.products.sellerId, [...bySeller.keys()]), eq(schema.products.active, true)];
  if (opts.maxPriceCents != null) filters.push(sql`${schema.products.priceCents} <= ${opts.maxPriceCents}`);
  const rows = await db.query.products.findMany({ where: and(...filters), orderBy: schema.products.priceCents });
  return rankProducts(rows, opts.query)
    .slice(0, opts.limit ?? 24)
    .map((p) => withShop(p, bySeller.get(p.sellerId)!));
}

export function withShop(p: Product, seller: Seller) {
  return { ...publicProduct(p), shop: shopCard(seller) };
}

/** A product on sale at a listed shop, with its shop. */
export async function findListedProduct(productId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return undefined;
  const [row] = await db
    .select({ product: schema.products, seller: schema.sellers })
    .from(schema.products)
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
    .where(and(eq(schema.products.id, productId), eq(schema.products.active, true), listedSellers()))
    .limit(1);
  return row;
}

/** The shop an order belongs to, by our order id or the PayPal order id. */
export async function sellerForOrder(id: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const [row] = await db
    .select({ seller: schema.sellers })
    .from(schema.orders)
    .innerJoin(schema.sellers, eq(schema.sellers.id, schema.orders.sellerId))
    .where(isUuid ? eq(schema.orders.id, id) : eq(schema.orders.paypalOrderId, id))
    .limit(1);
  return row?.seller;
}
