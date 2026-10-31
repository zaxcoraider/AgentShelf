import { dashboardData } from "@/lib/dashboard-data";
import { sessionSeller } from "@/lib/seller-session";

/** The signed-in seller's dashboard data (orders, products, agent actions, disputes) for AG Studio. */
export const dynamic = "force-dynamic";

export async function GET() {
  const seller = await sessionSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(await dashboardData(seller), { headers: { "Cache-Control": "no-store" } });
}
