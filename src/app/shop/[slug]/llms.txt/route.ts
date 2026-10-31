import { requestBaseUrl } from "@/lib/base-url";
import { shopLlmsTxt, textResponse } from "@/lib/llms-txt";
import { getShop } from "@/lib/shop";

// One shop's facts and buying instructions for AI assistants, in llms.txt form.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const seller = await getShop((await params).slug);
  if (!seller) return new Response("No such shop", { status: 404 });
  return textResponse(await shopLlmsTxt(seller, await requestBaseUrl()));
}
