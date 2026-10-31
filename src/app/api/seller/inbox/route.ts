import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sessionSeller } from "@/lib/seller-session";

/**
 * A fingerprint of everything the Inbox shows. The Inbox polls this and refreshes when it changes:
 * a new order, an agent action, an approval, or a dispute update. Ids + statuses, not timestamps,
 * because some changes (like an approval) don't touch updated_at.
 */
export const dynamic = "force-dynamic";

const fingerprint = (row: ReturnType<typeof sql>) => sql<string | null>`md5(string_agg(${row}, ',' order by ${row}))`;

export async function GET() {
  const seller = await sessionSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { orders, agentActions: actions, disputes } = schema;
  const [[o], [a], [d]] = await Promise.all([
    db
      .select({ v: fingerprint(sql`${orders.id}::text || ${orders.status}::text || coalesce(${orders.trackingNumber}, '')`) })
      .from(orders)
      .where(eq(orders.sellerId, seller.id)),
    db
      .select({ v: fingerprint(sql`${actions.id}::text || ${actions.status}::text`) })
      .from(actions)
      .where(eq(actions.sellerId, seller.id)),
    db
      .select({ v: fingerprint(sql`${disputes.id}::text || ${disputes.status} || coalesce(${disputes.aiRecommendation}, '')`) })
      .from(disputes)
      .innerJoin(orders, eq(orders.id, disputes.orderId))
      .where(eq(orders.sellerId, seller.id)),
  ]);
  return Response.json({ version: `${o?.v}:${a?.v}:${d?.v}` }, { headers: { "Cache-Control": "no-store" } });
}
