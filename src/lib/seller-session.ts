import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "./db";
import { currentSeller } from "./seller";
import { SESSION_COOKIE, sellerAuthEnabled, verifySessionToken } from "./session";

/**
 * The signed-in seller, for seller pages and server actions. Call it before any try/catch:
 * when there's no valid session it redirects to /signin, which works by throwing.
 */
export async function requireSeller() {
  if (!sellerAuthEnabled()) return currentSeller();
  const slug = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const seller = slug && (await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, slug) }));
  if (!seller) redirect("/signin");
  return seller;
}
