import { generateText } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { aiConfigured, withFallback } from "./ai";
import { db, schema } from "./db";
import type { Product, Seller } from "./db/schema";
import { usd } from "./money";
import { captureOrder, createOrder, type CheckoutChannel } from "./paypal/client";

export { usd };

/**
 * Shop logic shared by the MCP server (AI buyers) and the storefront (human buyers):
 * catalog search, seller Q&A, checkout via PayPal Orders, and capture on return.
 */

export const SHIPPING_CENTS = 595;
export const MAX_QUANTITY = 5;

// Render sets RENDER_EXTERNAL_URL, so APP_URL only needs setting for a custom domain.
const appUrl = () => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

export class ShopError extends Error {}

export async function getShop(slug: string) {
  return db.query.sellers.findFirst({ where: eq(schema.sellers.slug, slug) });
}

/** What buyers (and their AIs) see of a product. */
export function publicProduct(p: Product) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price: usd(p.priceCents),
    priceCents: p.priceCents,
    attributes: p.attributes,
    inStock: p.stock > 0,
    stock: p.stock,
  };
}

export async function searchProducts(
  seller: Seller,
  opts: { query?: string; maxPriceCents?: number } = {},
) {
  const filters = [eq(schema.products.sellerId, seller.id), eq(schema.products.active, true)];
  if (opts.maxPriceCents != null) filters.push(sql`${schema.products.priceCents} <= ${opts.maxPriceCents}`);
  const rows = await db.query.products.findMany({ where: and(...filters), orderBy: schema.products.priceCents });

  // Small catalogs, so rank in memory: a title match counts double, and more matched words rank higher.
  const words = (opts.query ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return rows.map(publicProduct);
  const scored = rows.map((p) => {
    const title = p.title.toLowerCase();
    const body = `${p.description} ${Object.values(p.attributes).join(" ")}`.toLowerCase();
    const score = words.reduce((s, w) => s + (title.includes(w) ? 2 : body.includes(w) ? 1 : 0), 0);
    return { p, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => publicProduct(s.p));
}

export async function getProduct(seller: Seller, productId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return undefined;
  return db.query.products.findFirst({
    where: and(eq(schema.products.id, productId), eq(schema.products.sellerId, seller.id)),
  });
}

/**
 * Answer a shopper's question from the seller's policy and listing data only.
 * Without an AI model configured, returns the facts so the calling assistant can answer itself.
 */
export async function askSeller(seller: Seller, question: string, product?: Product) {
  const facts = [
    `Shop: ${seller.name}. ${seller.tagline ?? ""}`,
    `Shop policy:\n${seller.policy ?? "No policy written yet."}`,
    product && `Product: ${product.title} (${usd(product.priceCents)}). ${product.description}`,
    product && `Attributes: ${JSON.stringify(product.attributes)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!aiConfigured("fast")) return { answer: null, facts };

  const { text } = await withFallback("fast", (model) =>
    generateText({
      model,
      system:
        `You answer shopper questions for ${seller.name}, a small independent shop. ` +
        "Use only the facts provided. If the facts don't cover it, say you're not sure and suggest asking the seller directly. " +
        "Two or three sentences, friendly, no markdown.",
      prompt: `${facts}\n\nShopper question: ${question}`,
    }),
  );
  return { answer: text.trim(), facts };
}

/** Create a PayPal order for one product and record it. Returns the link the buyer approves. */
export async function startCheckout(
  seller: Seller,
  opts: { productId: string; quantity: number; channel: CheckoutChannel; agentName?: string },
) {
  const product = await getProduct(seller, opts.productId);
  if (!product || !product.active) throw new ShopError(`No product with id ${opts.productId} in ${seller.name}.`);
  if (!Number.isInteger(opts.quantity) || opts.quantity < 1 || opts.quantity > MAX_QUANTITY) {
    throw new ShopError(`Quantity must be between 1 and ${MAX_QUANTITY}.`);
  }
  if (product.stock < opts.quantity) {
    throw new ShopError(`Only ${product.stock} of "${product.title}" left in stock.`);
  }

  const amountCents = product.priceCents * opts.quantity + SHIPPING_CENTS;
  const paypal = await createOrder({
    amountCents,
    description: `${seller.name}: ${product.title} x${opts.quantity}`,
    channel: opts.channel,
    agentName: opts.agentName,
    returnUrl: `${appUrl()}/checkout/return`,
    cancelUrl: `${appUrl()}/checkout/cancel`,
  });
  if (!paypal.approveUrl) throw new ShopError("PayPal did not return an approval link.");

  const [order] = await db
    .insert(schema.orders)
    .values({
      sellerId: seller.id,
      productId: product.id,
      quantity: opts.quantity,
      paypalOrderId: paypal.id,
      channel: opts.channel,
      agentName: opts.agentName,
      amountCents,
      status: "created",
    })
    .returning();

  return {
    orderId: order.id,
    paypalOrderId: paypal.id,
    product: product.title,
    quantity: opts.quantity,
    subtotal: usd(product.priceCents * opts.quantity),
    shipping: usd(SHIPPING_CENTS),
    total: usd(amountCents),
    approveUrl: paypal.approveUrl,
  };
}

/**
 * Capture an approved PayPal order (buyer came back from PayPal). Safe to call twice:
 * an order that is already paid is returned as is.
 */
export async function completeCheckout(paypalOrderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.paypalOrderId, paypalOrderId) });
  if (!order) throw new ShopError("We couldn't find that order.");
  if (order.status !== "created" && order.status !== "approved") return order;

  const capture = await captureOrder(paypalOrderId);
  if (capture.status !== "COMPLETED") throw new ShopError(`PayPal returned status ${capture.status}.`);

  return db.transaction(async (tx) => {
    const [paid] = await tx
      .update(schema.orders)
      .set({
        status: "paid",
        captureId: capture.captureId,
        buyerEmail: capture.payerEmail,
        buyerName: capture.payerName,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, order.id))
      .returning();
    if (order.productId) {
      await tx
        .update(schema.products)
        .set({ stock: sql`greatest(${schema.products.stock} - ${order.quantity}, 0)` })
        .where(eq(schema.products.id, order.productId));
    }
    return paid;
  });
}

/** Order status for a buyer or their AI, by our order id or the PayPal order id. No buyer PII. */
/** Look up one of this shop's orders by our order id or the PayPal order id. */
export async function findOrder(seller: Seller, id: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  return db.query.orders.findFirst({
    where: and(
      eq(schema.orders.sellerId, seller.id),
      isUuid ? eq(schema.orders.id, id) : eq(schema.orders.paypalOrderId, id),
    ),
  });
}

export async function orderStatus(seller: Seller, id: string) {
  const order = await findOrder(seller, id);
  if (!order) return undefined;
  const product = order.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, order.productId) })
    : undefined;
  return {
    orderId: order.id,
    paypalOrderId: order.paypalOrderId,
    product: product?.title,
    quantity: order.quantity,
    total: usd(order.amountCents),
    refunded: order.refundedCents ? usd(order.refundedCents) : undefined,
    status: order.status,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    placedAt: order.createdAt.toISOString(),
  };
}
