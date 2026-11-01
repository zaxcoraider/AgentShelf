import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { refreshProductMarket } from "@/lib/market";
import { sessionSeller } from "@/lib/seller-session";

/**
 * "Check market prices": refresh Market watch for the signed-in shop's products with photos, skipping
 * any checked in the last 6 hours (each check is one Channel3 credit).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_GAP_MS = 6 * 60 * 60 * 1000;

export async function POST() {
  const seller = await sessionSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!process.env.CHANNEL3_API_KEY) return Response.json({ error: "Market prices aren't set up (no Channel3 key)." }, { status: 503 });
  const due = await db.query.products.findMany({
    where: and(
      eq(schema.products.sellerId, seller.id),
      eq(schema.products.active, true),
      isNotNull(schema.products.imageUrl),
      or(isNull(schema.products.marketCheckedAt), lt(schema.products.marketCheckedAt, new Date(Date.now() - MIN_GAP_MS))),
    ),
    limit: 20,
  });
  const counts = { checked: 0, found: 0, few: 0, failed: 0 };
  for (const p of due) {
    const r = await refreshProductMarket(p.id);
    counts.checked++;
    if (r.status === "ok") counts.found++;
    else if (r.status === "few") counts.few++;
    else counts.failed++;
  }
  return Response.json(counts);
}
