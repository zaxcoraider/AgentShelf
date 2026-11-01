import { eq } from "drizzle-orm";
import { verifyChannel3Webhook, type PriceChangedEvent } from "@/lib/channel3";
import { db, schema } from "@/lib/db";
import { applyPriceChange } from "@/lib/market";

/**
 * Channel3 product-subscription webhooks (Market watch). Signed with the endpoint's whsec_ secret
 * (CHANNEL3_WEBHOOK_SECRET, from the Channel3 dashboard). Each event is applied once: its id is
 * recorded alongside PayPal's webhook events, prefixed "c3:".
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyChannel3Webhook(req.headers, body))) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }
  const event = JSON.parse(body) as PriceChangedEvent | { id: string; type: string };
  const id = `c3:${event.id}`;
  const [fresh] = await db
    .insert(schema.webhookEvents)
    .values({ id, type: `channel3.${event.type}`, resourceId: "data" in event ? event.data.subject.product_id : null, payload: event })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (!fresh) return Response.json({ received: true, duplicate: true });

  let outcome = `ignored: ${event.type}`;
  if (event.type === "offer.price.changed") {
    const moved = await applyPriceChange(event as PriceChangedEvent);
    outcome = moved ? `price change applied to ${moved} product(s)` : "no tracked comparable changed";
  }
  await db.update(schema.webhookEvents).set({ outcome }).where(eq(schema.webhookEvents.id, id));
  return Response.json({ received: true });
}
