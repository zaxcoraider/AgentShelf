/**
 * Seed the demo seller "Maya's Candles": products, 30 days of order history, and agent actions.
 * Seeded orders are flagged `demo` (no real PayPal records), so the seller agent never acts on them.
 *
 * Run: npm run db:seed            → seeds only if the shop doesn't exist yet
 *      npm run db:seed -- --reset → deletes the shop (and its orders) first
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";

const SLUG = "mayas-candles";
const reset = process.argv.includes("--reset");

const existing = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, SLUG) });
if (existing && !reset) {
  console.log(`"${existing.name}" already seeded. Use --reset to recreate it.`);
  process.exit(0);
}
if (existing) await db.delete(schema.sellers).where(eq(schema.sellers.id, existing.id));

// Deterministic randomness so every reset produces the same demo data.
let state = 20261112;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];

const [seller] = await db
  .insert(schema.sellers)
  .values({
    slug: SLUG,
    name: "Maya's Candles",
    tagline: "Hand-poured soy candles from a small studio in Portland, Oregon",
    ownerName: "Maya",
    refundAutoLimitCents: 3000,
    policy: [
      "All candles are hand-poured in small batches with 100% soy wax and cotton wicks.",
      "Fragrances are phthalate-free. No paraffin, no dyes in the natural line.",
      "Orders ship within 2 business days from Portland, OR via USPS Ground Advantage (3-5 days).",
      "Returns: unused candles within 30 days. Damaged in transit: full refund, no return needed.",
      "Custom scents and wedding favors available for orders of 20+; ask for an invoice.",
    ].join("\n"),
  })
  .returning();

const productSeeds = [
  { title: "Lavender Fields Soy Candle", priceCents: 2200, scent: "Lavender, chamomile", size: "8 oz", burn: "45 hours", stock: 24 },
  { title: "Cedar & Smoke Soy Candle", priceCents: 2600, scent: "Cedarwood, vetiver, campfire", size: "8 oz", burn: "45 hours", stock: 18 },
  { title: "Citrus Grove Travel Tin", priceCents: 1400, scent: "Orange, grapefruit, basil", size: "4 oz", burn: "20 hours", stock: 40 },
  { title: "Rainy Day Library Candle", priceCents: 2800, scent: "Old books, black tea, amber", size: "10 oz", burn: "55 hours", stock: 12 },
  { title: "Fig & Honey Soy Candle", priceCents: 2400, scent: "Fig, honey, sandalwood", size: "8 oz", burn: "45 hours", stock: 20 },
  { title: "Unscented Pillar Trio", priceCents: 3200, scent: "Unscented", size: "3 x 3 in pillars", burn: "30 hours each", stock: 10 },
  { title: "Pacific Sea Salt Candle", priceCents: 2600, scent: "Sea salt, driftwood, sage", size: "8 oz", burn: "45 hours", stock: 16 },
  { title: "Gift Set: Three Minis", priceCents: 4500, scent: "Lavender, Cedar & Smoke, Citrus Grove", size: "3 x 4 oz", burn: "20 hours each", stock: 8 },
] as const;

const products = await db
  .insert(schema.products)
  .values(
    productSeeds.map((p) => ({
      sellerId: seller.id,
      title: p.title,
      description: `${p.title}. Hand-poured 100% soy wax with a cotton wick, ${p.size}, about ${p.burn} of burn time. Scent notes: ${p.scent}.`,
      attributes: { wax: "100% soy", wick: "cotton", scent: p.scent, size: p.size, burnTime: p.burn },
      priceCents: p.priceCents,
      stock: p.stock,
    })),
  )
  .returning();

const buyers = [
  "Sam Rivera", "Priya Shah", "Jordan Lee", "Alex Kim", "Taylor Brooks", "Morgan Chen",
  "Casey Patel", "Riley Nguyen", "Jamie Ortiz", "Drew Walker", "Avery Johnson", "Quinn Davis",
];
const agents = ["Claude", "Claude", "Claude", "ChatGPT", "ChatGPT", "Perplexity"] as const;
const carriers = ["USPS", "USPS", "UPS"] as const;
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const orderRows = Array.from({ length: 42 }, (_, i) => {
  const product = pick(products);
  const quantity = rand() < 0.8 ? 1 : 2;
  const amountCents = product.priceCents * quantity + 595; // flat shipping
  // The AI share grows over the month, which is the story the dashboard tells.
  const ageDays = 30 * (1 - i / 42) + rand();
  const isAi = rand() < 0.25 + 0.45 * (i / 42);
  const buyerName = pick(buyers);
  const roll = rand();
  const status =
    ageDays < 2 ? (roll < 0.6 ? "paid" : "shipped")
    : roll < 0.08 ? "refunded"
    : roll < 0.11 ? "disputed"
    : "shipped";
  return {
    sellerId: seller.id,
    productId: product.id,
    quantity,
    channel: isAi ? ("ai_agent" as const) : ("human" as const),
    agentName: isAi ? pick(agents) : null,
    buyerName,
    buyerEmail: `${buyerName.toLowerCase().replace(" ", ".")}@example.com`,
    amountCents,
    refundedCents: status === "refunded" ? amountCents : 0,
    status: status as (typeof schema.orderStatus.enumValues)[number],
    carrier: status === "paid" ? null : pick(carriers),
    trackingNumber: status === "paid" ? null : `9400${Math.floor(rand() * 1e15).toString().padStart(15, "0")}`,
    demo: true,
    createdAt: new Date(now - ageDays * DAY),
    updatedAt: new Date(now - Math.max(0, ageDays - 2) * DAY),
  };
});

const orders = await db.insert(schema.orders).values(orderRows).returning();

// Agent history: tracking for shipped orders, refunds within the limit, dispute reviews.
const actions = orders.flatMap((o) => {
  const at = (hours: number) => new Date(o.createdAt.getTime() + hours * 60 * 60 * 1000);
  const rows: (typeof schema.agentActions.$inferInsert)[] = [];
  if (o.trackingNumber) {
    rows.push({
      sellerId: seller.id,
      orderId: o.id,
      tool: "create_shipment_tracking",
      input: { carrier: o.carrier, tracking_number: o.trackingNumber },
      output: { status: "SHIPPED" },
      status: "auto",
      reason: `Maya marked the order shipped; added ${o.carrier} tracking to the PayPal transaction.`,
      createdAt: at(30),
    });
  }
  if (o.status === "refunded") {
    const withinLimit = o.amountCents <= seller.refundAutoLimitCents;
    rows.push({
      sellerId: seller.id,
      orderId: o.id,
      tool: "create_refund",
      input: { amount: (o.amountCents / 100).toFixed(2), note: "Arrived damaged" },
      output: { status: "COMPLETED" },
      status: withinLimit ? "auto" : "approved",
      reason: withinLimit
        ? `Buyer reported the jar arrived cracked. $${(o.amountCents / 100).toFixed(2)} is under the $30 auto-refund limit, so I refunded it in full.`
        : `Buyer reported the jar arrived cracked. $${(o.amountCents / 100).toFixed(2)} is over the $30 limit, so I asked Maya first; she approved.`,
      createdAt: at(96),
    });
  }
  if (o.status === "disputed") {
    rows.push({
      sellerId: seller.id,
      orderId: o.id,
      tool: "get_dispute",
      input: { reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" },
      output: { status: "OPEN" },
      status: "auto",
      reason: "Buyer says it never arrived, but tracking shows it was delivered. Recommend fighting it with the tracking as evidence.",
      createdAt: at(200),
    });
  }
  return rows;
});

if (actions.length) await db.insert(schema.agentActions).values(actions);

console.log(
  `Seeded "${seller.name}": ${products.length} products, ${orders.length} orders ` +
    `(${orders.filter((o) => o.channel === "ai_agent").length} from AI shoppers), ${actions.length} agent actions.`,
);
process.exit(0);
