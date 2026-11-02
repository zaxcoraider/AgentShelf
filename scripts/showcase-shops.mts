/**
 * Permanent showcase shops beside Maya's Candles, so the marketplace (one connector, every shop)
 * has real variety for judges: different crafts, and different shipping rules for the AI to get
 * right ("which of these ships to Canada?"). Runs on every seed (each deploy) and only fills gaps.
 *
 * Also keeps the owner's own shop Juniper Clay Studio (made on /start) from expiring, gives it the
 * mugs its tagline promises, and removes its one accidental duplicate listing.
 */
import { readFileSync } from "node:fs";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "../src/lib/db";
import type { ShopPolicy } from "../src/lib/db/schema";
import { SAMPLE_PRODUCTS, type SampleProduct } from "../src/app/start/samples";

const photo = (file: string) => readFileSync(new URL(`./seed-photos/samples/${file}`, import.meta.url));

const policy = (p: Partial<ShopPolicy> & Pick<ShopPolicy, "shipsFrom" | "shipsTo" | "materials">): ShopPolicy => ({
  processingDays: { min: 1, max: 3 },
  carrier: "USPS Ground Advantage",
  transitDays: { min: 3, max: 6 },
  shippingCents: 595,
  returnsDays: 30,
  returnsCondition: "the item is unused and in its original packaging",
  returnShippingPaidBy: "buyer",
  damaged: "full refund or a replacement. Send a photo of the damage.",
  customOrders: null,
  ...p,
});

const SHOPS = [
  {
    slug: "fernwood-print-studio",
    name: "Fernwood Print Studio",
    ownerName: "Elena",
    tagline: "Botanical and landscape art prints, printed to order on archival paper",
    products: SAMPLE_PRODUCTS.prints,
    shopPolicy: policy({
      shipsFrom: "Asheville, North Carolina, USA",
      shipsTo: ["US", "CA", "GB", "AU"],
      materials: "Archival pigment inks on fine art, cotton rag and matte photo papers. Prints ship flat in a rigid mailer, unframed.",
      processingDays: { min: 2, max: 4 },
      transitDays: { min: 4, max: 10 },
      returnsDays: 14,
      customOrders: "Custom sizes up to 24 × 36 in on request.",
    }),
  },
  {
    slug: "saltwater-silver",
    name: "Saltwater Silver",
    ownerName: "Theo",
    tagline: "Hand-forged silver rings, beaded necklaces and leather earrings from the Maine coast",
    products: SAMPLE_PRODUCTS.jewelry,
    shopPolicy: policy({
      shipsFrom: "Portland, Maine, USA",
      shipsTo: ["US", "CA"],
      materials: "Sterling silver rings, glass seed bead necklaces with gold-tone clasps, metallic leather earrings on hypoallergenic, nickel-free hooks.",
      shippingCents: 0,
      customOrders: "Ring resizing is free within 30 days.",
    }),
  },
];

async function addProducts(sellerId: string, products: SampleProduct[]) {
  for (const p of products) {
    const [product] = await db
      .insert(schema.products)
      .values({
        sellerId,
        title: p.title,
        description: p.description,
        attributes: { scent: p.details, size: p.size },
        priceCents: p.priceCents,
        stock: 12,
      })
      .returning();
    await db.insert(schema.productImages).values({ productId: product.id, mediaType: "image/jpeg", data: photo(p.photo) });
    await db.update(schema.products).set({ imageUrl: `/images/products/${product.id}` }).where(eq(schema.products.id, product.id));
  }
}

export async function ensureShowcaseShops() {
  const notes: string[] = [];

  for (const shop of SHOPS) {
    const existing = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, shop.slug) });
    if (existing) continue;
    const [seller] = await db
      .insert(schema.sellers)
      .values({ slug: shop.slug, name: shop.name, ownerName: shop.ownerName, tagline: shop.tagline, shopPolicy: shop.shopPolicy })
      .returning();
    await addProducts(seller.id, shop.products);
    notes.push(`added ${shop.name}`);
  }

  // The owner's own Juniper Clay Studio: keep it through judging, with the mugs its tagline promises.
  const juniper = await db.query.sellers.findFirst({ where: eq(schema.sellers.name, "Juniper Clay Studio") });
  if (juniper) {
    if (juniper.expiresAt) {
      await db.update(schema.sellers).set({ expiresAt: null }).where(eq(schema.sellers.id, juniper.id));
      notes.push("Juniper Clay Studio no longer expires");
    }
    const titles = new Set(
      (await db.query.products.findMany({ columns: { title: true }, where: eq(schema.products.sellerId, juniper.id) })).map((p) => p.title),
    );
    const mugs = SAMPLE_PRODUCTS.ceramics.filter((p) => /mug|cup/i.test(p.title) && !titles.has(p.title));
    if (mugs.length) {
      await addProducts(juniper.id, mugs);
      notes.push(`added ${mugs.length} mugs to Juniper`);
    }
    // One listing was published twice, the second with a cut-off title. Remove it, or hide it if it
    // has orders (even an unpaid checkout), so the order history keeps its product.
    const dupe = await db.query.products.findFirst({
      where: and(eq(schema.products.sellerId, juniper.id), eq(schema.products.title, "Deep Blue Stoneware Nesting Bowl Set,")),
    });
    if (dupe && titles.has("Deep Blue Stoneware Nesting Bowl Set, Set of 2")) {
      const [{ n }] = await db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.productId, dupe.id));
      if (n === 0) {
        await db.delete(schema.products).where(eq(schema.products.id, dupe.id));
        notes.push("removed Juniper's duplicate bowl set");
      } else if (dupe.active) {
        await db.update(schema.products).set({ active: false }).where(eq(schema.products.id, dupe.id));
        notes.push("hid Juniper's duplicate bowl set (it has orders)");
      }
    }
  }

  return notes;
}
