import { sessionSeller } from "@/lib/seller-session";
import { STUDIO_SELLER_TOOLS, runStudioSellerTool, type StudioSellerTool } from "@/lib/studio-agent/tools";

/** Runs one of the PayPal seller agent's read-only tools for the AG Studio dashboard. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const seller = await sessionSeller();
  if (!seller) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { tool?: string; args?: Record<string, unknown> } | null;
  const tool = body?.tool as StudioSellerTool | undefined;
  if (!tool || !STUDIO_SELLER_TOOLS.includes(tool)) {
    return Response.json({ error: `Unknown tool. Use one of: ${STUDIO_SELLER_TOOLS.join(", ")}.` }, { status: 400 });
  }
  try {
    const result = await runStudioSellerTool(seller, tool, body?.args ?? {});
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`[studio tools] ${tool} failed`, err);
    return Response.json({ error: "That lookup failed. Try again." }, { status: 500 });
  }
}
