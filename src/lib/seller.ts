import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** The demo seller every seller page acts as. Swap for a session lookup when sign-in lands. */
export const DEMO_SELLER_SLUG = "mayas-candles";

export async function currentSeller() {
  const seller = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, DEMO_SELLER_SLUG) });
  if (!seller) throw new Error(`Demo seller "${DEMO_SELLER_SLUG}" is missing. Run npm run db:setup.`);
  return seller;
}

/** "5m ago" style timestamps for activity feeds. */
export function timeAgo(date: Date, now = Date.now()) {
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
