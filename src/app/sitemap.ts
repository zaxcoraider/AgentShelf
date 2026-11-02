import type { MetadataRoute } from "next";
import { and, eq, exists, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appUrl } from "@/lib/shop";

// Read the shops at request time (the database isn't there during the build).
export const dynamic = "force-dynamic";

/** The site's pages plus every permanent marketplace shop and its llms.txt. Visitor demo shops come and go, so they're left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const shops = await db
    .select({ slug: schema.sellers.slug, createdAt: schema.sellers.createdAt })
    .from(schema.sellers)
    .where(
      and(
        eq(schema.sellers.marketplace, true),
        isNull(schema.sellers.expiresAt),
        exists(
          db
            .select({ id: schema.products.id })
            .from(schema.products)
            .where(and(eq(schema.products.sellerId, schema.sellers.id), eq(schema.products.active, true))),
        ),
      ),
    );
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/judges`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/start`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/llms.txt`, changeFrequency: "daily", priority: 0.5 },
    ...shops.flatMap((s) => [
      { url: `${base}/shop/${s.slug}`, lastModified: s.createdAt, changeFrequency: "daily" as const, priority: 0.9 },
      { url: `${base}/shop/${s.slug}/llms.txt`, lastModified: s.createdAt, changeFrequency: "daily" as const, priority: 0.4 },
    ]),
  ];
}
