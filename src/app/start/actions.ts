"use server";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import type { ShopPolicy } from "@/lib/db/schema";
import { hashPassword } from "@/lib/passwords";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { shopSlug, startSession } from "@/lib/seller-auth";
import { SHIP_TO, SHOP_KINDS, START_LIMITS, type CreateShopState, type ShopKind } from "./options";
import { SAMPLE_PRODUCTS } from "./samples";
import { refreshInBackground, refreshShopMarket } from "@/lib/market";

/**
 * Create a visitor shop from the /start form, sign the browser in as it, and go to the welcome page.
 * The only export here is the action itself (every export of a "use server" file is public).
 */

const DAY = 24 * 60 * 60 * 1000;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function createShop(_prev: CreateShopState, form: FormData): Promise<CreateShopState> {
  const name = text(form, "name");
  const ownerName = text(form, "ownerName");
  const tagline = text(form, "tagline");
  const password = String(form.get("password") ?? "");
  const shipsFrom = text(form, "shipsFrom");
  const materials = text(form, "materials");
  const shipsTo = SHIP_TO[text(form, "shipsTo") as keyof typeof SHIP_TO];
  const processing = text(form, "processing") === "3-5" ? { min: 3, max: 5 } : { min: 1, max: 2 };
  const shippingCents = text(form, "shipping") === "free" ? 0 : 595;
  const returnsDays = { "30": 30, "14": 14, none: 0 }[text(form, "returns")] ?? 30;
  const kind = (SHOP_KINDS.some((k) => k.id === text(form, "kind")) ? text(form, "kind") : "other") as ShopKind;
  const samples = form.get("samples") === "on" && kind !== "other";
  const values = Object.fromEntries(
    ["name", "ownerName", "tagline", "shipsFrom", "materials", "shipsTo", "processing", "shipping", "returns", "kind"].map((k) => [
      k,
      text(form, k),
    ]),
  );
  values.samples = samples ? "on" : "off";

  const errors: Record<string, string> = {};
  if (name.length < 3 || name.length > 40) errors.name = "Use 3 to 40 characters.";
  else if (shopSlug(name).length < 3) errors.name = "Use some letters or numbers.";
  if (!ownerName || ownerName.length > 40) errors.ownerName = "Up to 40 characters.";
  if (tagline.length > 90) errors.tagline = "Keep it under 90 characters.";
  if (password.length < 8 || password.length > 100) errors.password = "At least 8 characters.";
  if (shipsFrom.length < 2 || shipsFrom.length > 60) errors.shipsFrom = "Say where you ship from, e.g. Austin, Texas, USA.";
  if (materials.length < 3 || materials.length > 160) errors.materials = "A few words, up to 160 characters.";
  if (!shipsTo) errors.shipsTo = "Pick where you ship.";
  if (Object.keys(errors).length) return { errors, values, message: "A few fields need a look." };

  // Abuse limits: a few shops per visitor per day, and a ceiling for the whole site.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const creatorKey = createHash("sha256")
    .update(`${process.env.SESSION_SECRET ?? process.env.SELLER_DEMO_PASSWORD ?? "dev"}:${ip}`)
    .digest("base64url");
  const since = new Date(Date.now() - DAY);
  const [[mine], [all]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.sellers)
      .where(and(eq(schema.sellers.creatorKey, creatorKey), gte(schema.sellers.createdAt, since))),
    db
      .select({ n: count() })
      .from(schema.sellers)
      .where(and(eq(schema.sellers.visitor, true), gte(schema.sellers.createdAt, since))),
  ]);
  if (mine.n >= START_LIMITS.perVisitorPerDay) {
    return { values, message: `You've made ${mine.n} shops today, which is the limit. Sign in to one of them instead.` };
  }
  if (all.n >= START_LIMITS.sitePerDay) {
    return { values, message: "Lots of shops were created today. Try again tomorrow, or explore Maya's Candles." };
  }

  // Expired visitor shops go (their products, orders and agent log cascade with them).
  await db.delete(schema.sellers).where(and(eq(schema.sellers.visitor, true), lt(schema.sellers.expiresAt, new Date())));

  const slug = await uniqueSlug(shopSlug(name));
  const policy: ShopPolicy = {
    shipsFrom,
    shipsTo: [...shipsTo],
    processingDays: processing,
    carrier: "USPS Ground Advantage",
    transitDays: { min: 3, max: 5 },
    shippingCents,
    returnsDays,
    returnsCondition: "the item is unused and in its original packaging",
    returnShippingPaidBy: "buyer",
    damaged: "full refund or a replacement. Send a photo of the damage.",
    materials,
    customOrders: null,
  };

  const [seller] = await db
    .insert(schema.sellers)
    .values({
      slug,
      name,
      ownerName,
      tagline: tagline || null,
      shopPolicy: policy,
      visitor: true,
      passwordHash: await hashPassword(password),
      creatorKey,
      expiresAt: new Date(Date.now() + START_LIMITS.shopDays * DAY),
    })
    .returning();

  if (samples) {
    if (kind === "candles") await copySampleProducts(seller.id);
    else await addSampleProducts(seller.id, kind);
  }

  if (samples) refreshInBackground(() => refreshShopMarket(seller.id, { onlyNew: true }));

  await startSession(seller);
  redirect("/seller/welcome");
}

async function uniqueSlug(base: string) {
  const root = base.slice(0, 40).replace(/-+$/, "") || "shop";
  const taken = new Set(
    (await db.query.sellers.findMany({ columns: { slug: true } })).map((s) => s.slug).concat(DEMO_SELLER_SLUG),
  );
  if (!taken.has(root) && !RESERVED.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${crypto.randomUUID().slice(0, 6)}`;
}

const RESERVED = new Set(["admin", "api", "seller", "shop", "start", "signin", "agentshelf", "paypal"]);

/** Three of the showcase shop's candles, photos included, so a new shop has something to sell at once. */
async function copySampleProducts(sellerId: string) {
  const showcase = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, DEMO_SELLER_SLUG) });
  if (!showcase) return;
  const picks = await db.query.products.findMany({
    where: and(eq(schema.products.sellerId, showcase.id), inArray(schema.products.title, SAMPLE_TITLES)),
  });
  for (const p of picks) {
    const [copy] = await db
      .insert(schema.products)
      .values({
        sellerId,
        title: p.title,
        description: p.description,
        attributes: p.attributes,
        priceCents: p.priceCents,
        stock: 10,
      })
      .returning();
    const image = await db.query.productImages.findFirst({ where: eq(schema.productImages.productId, p.id) });
    if (image) {
      await db.insert(schema.productImages).values({ productId: copy.id, mediaType: image.mediaType, data: image.data });
      await db
        .update(schema.products)
        .set({ imageUrl: `/images/products/${copy.id}` })
        .where(eq(schema.products.id, copy.id));
    }
  }
}

const SAMPLE_TITLES = ["Lavender Fields Soy Candle", "Citrus Grove Travel Tin", "Rainy Day Library Candle"];

/** Three sample products for a ceramics, prints or jewelry shop, with their stock photos. */
async function addSampleProducts(sellerId: string, kind: Exclude<ShopKind, "candles" | "other">) {
  for (const p of SAMPLE_PRODUCTS[kind]) {
    const [product] = await db
      .insert(schema.products)
      .values({
        sellerId,
        title: p.title,
        description: p.description,
        attributes: { scent: p.details, size: p.size },
        priceCents: p.priceCents,
        stock: 10,
      })
      .returning();
    const photo = await readFile(path.join(process.cwd(), "scripts/seed-photos/samples", p.photo)).catch(() => null);
    if (!photo) continue; // A missing photo leaves the drawn placeholder; the product still sells.
    await db.insert(schema.productImages).values({ productId: product.id, mediaType: "image/jpeg", data: photo });
    await db
      .update(schema.products)
      .set({ imageUrl: `/images/products/${product.id}` })
      .where(eq(schema.products.id, product.id));
  }
}
