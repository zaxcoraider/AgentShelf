import { randomUUID } from "node:crypto";
import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withFallback } from "./ai";
import { db, schema } from "./db";
import type { Seller } from "./db/schema";
import { usd } from "./money";
import { createCatalogProduct } from "./paypal/toolkit";
import { appUrl } from "./shop";
import { policyText } from "./shop-facts";
import { LIMITS } from "./listing-limits";

/**
 * Photo → listing onboarding: a vision model drafts the listing from a product photo,
 * the seller edits it, and publishing creates the product in the seller's PayPal catalog
 * (Agent Toolkit `create_product`) and in the shop.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export const listingDraft = z.object({
  title: z.string().describe("Short product name, under 60 characters, no emojis"),
  description: z.string().describe("Two or three warm, specific sentences for shoppers. Only claim what the photo or shop policy supports."),
  scent: z.string().describe("Two to four scent notes, comma-separated, e.g. 'Lavender, chamomile'; 'Unscented' if none. Not a sentence."),
  size: z.string().describe("Size only, e.g. '8 oz'; if not visible, the shop's usual size"),
  suggestedPriceUsd: z.number().describe("Price in USD that fits this shop's existing prices"),
  priceReason: z.string().describe("One sentence on why that price, comparing to the shop's products"),
});
export type ListingDraft = z.infer<typeof listingDraft>;

export class ListingError extends Error {}

function checkImage(image: { data: Buffer; mediaType: string }) {
  if (!IMAGE_TYPES.includes(image.mediaType)) throw new ListingError("Use a JPEG, PNG, or WebP photo.");
  if (image.data.length > MAX_IMAGE_BYTES) throw new ListingError("That photo is too large (3 MB max).");
}

export async function draftListing(
  seller: Seller,
  image: { data: Buffer; mediaType: string },
): Promise<ListingDraft & { alreadySells?: string }> {
  checkImage(image);
  const catalog = await db.query.products.findMany({ where: eq(schema.products.sellerId, seller.id) });
  const context = [
    `Shop: ${seller.name}. ${seller.tagline ?? ""}`,
    `Shop policy:\n${policyText(seller)}`,
    "Current products and prices:",
    ...catalog.map((p) => `- ${p.title}: ${usd(p.priceCents)} (${p.attributes.size ?? "?"})`),
  ].join("\n");

  const { output } = await withFallback("vision", (model) =>
    generateText({
      model,
      output: Output.object({ schema: listingDraft }),
      system:
        `You write product listings for ${seller.name}, a small independent shop. ` +
        "Describe what's in the photo; use the shop policy for materials. Never invent awards, certifications, or burn times you can't support.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `${context}\n\nDraft a listing for the product in this photo.` },
            { type: "file", data: image.data, mediaType: image.mediaType },
          ],
        },
      ],
    }),
  );
  // The model recognises products the shop already sells; flag it rather than publish a duplicate.
  const same = catalog.find((p) => p.title.trim().toLowerCase() === output.title.trim().toLowerCase());
  return {
    ...output,
    // Keep drafts within what publishInput accepts, so a chatty model can't produce an unpublishable listing.
    title: clip(output.title, LIMITS.title),
    description: clip(output.description, LIMITS.description),
    scent: clip(output.scent, LIMITS.scent),
    size: clip(output.size, LIMITS.size),
    suggestedPriceUsd: Math.round(output.suggestedPriceUsd * 100) / 100,
    alreadySells: same?.title,
  };
}

/** Shorten to `max` characters, preferring the last comma, then a word boundary. */
function clip(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const comma = cut.lastIndexOf(",");
  const at = comma > max * 0.5 ? comma : cut.lastIndexOf(" ");
  return (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;.]+$/, "");
}

export const publishInput = z.object({
  title: z.string().trim().min(3).max(LIMITS.title),
  description: z.string().trim().min(10).max(LIMITS.description),
  scent: z.string().trim().max(LIMITS.scent),
  size: z.string().trim().max(LIMITS.size),
  priceUsd: z.number().min(1).max(10_000),
  stock: z.number().int().min(0).max(10_000),
});

/** Create the product in PayPal's catalog, then in the shop with its photo. */
export async function publishListing(
  seller: Seller,
  input: z.infer<typeof publishInput>,
  image: { data: Buffer; mediaType: string },
) {
  checkImage(image);
  const id = randomUUID();
  const imagePath = `/images/products/${id}`;
  // PayPal only accepts a public https image URL, so local runs publish without one.
  const base = appUrl();
  const paypalProductId = await createCatalogProduct({
    name: input.title,
    description: input.description,
    imageUrl: base.startsWith("https://") ? `${base}${imagePath}` : undefined,
    homeUrl: base.startsWith("https://") ? `${base}/shop/${seller.slug}` : undefined,
  });

  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(schema.products)
      .values({
        id,
        sellerId: seller.id,
        paypalProductId,
        title: input.title,
        description: input.description,
        attributes: { scent: input.scent, size: input.size },
        priceCents: Math.round(input.priceUsd * 100),
        imageUrl: imagePath,
        stock: input.stock,
      })
      .returning();
    await tx.insert(schema.productImages).values({ productId: id, mediaType: image.mediaType, data: image.data });
    return product;
  });
}
