import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canEditShop, sessionSeller } from "@/lib/seller-session";

/**
 * The signed-in shop's saved AG Studio dashboard. PUT saves the current state (sent by the
 * dashboard a moment after any change), DELETE goes back to the default layout. The showcase
 * shop is read-only on the hosted demo, so its dashboard is saved in each visitor's browser instead.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 400_000;

async function editableSeller() {
  const seller = await sessionSeller();
  if (!seller) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  if (!canEditShop(seller)) return { error: Response.json({ error: "The demo shop's dashboard is saved in your browser." }, { status: 403 }) };
  return { seller };
}

export async function PUT(req: Request) {
  const { seller, error } = await editableSeller();
  if (error) return error;
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Dashboard too large to save." }, { status: 413 });
  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Expected the dashboard state as JSON." }, { status: 400 });
  }
  // The shape Studio emits: pages plus the selected page. Studio validates the rest when it loads.
  const s = state as { pages?: unknown; selectedPageId?: unknown };
  if (!Array.isArray(s.pages) || typeof s.selectedPageId !== "string") {
    return Response.json({ error: "Not a dashboard state." }, { status: 400 });
  }
  await db.update(schema.sellers).set({ dashboardState: state }).where(eq(schema.sellers.id, seller.id));
  return new Response(null, { status: 204 });
}

export async function DELETE() {
  const { seller, error } = await editableSeller();
  if (error) return error;
  await db.update(schema.sellers).set({ dashboardState: null }).where(eq(schema.sellers.id, seller.id));
  return new Response(null, { status: 204 });
}
