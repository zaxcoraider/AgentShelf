import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Seller } from "./db/schema";
import { usd } from "./money";
import { policyLines } from "./shop-facts";

/** llms.txt (https://llmstxt.org) for one shop: what it sells, its policy, and how an assistant can buy. */
export async function shopLlmsTxt(seller: Seller, baseUrl: string) {
  const products = await db.query.products.findMany({
    where: and(eq(schema.products.sellerId, seller.id), eq(schema.products.active, true)),
    orderBy: asc(schema.products.priceCents),
  });
  const mcpUrl = `${baseUrl}/api/mcp/${seller.slug}`;
  return [
    `# ${seller.name}`,
    "",
    `> ${seller.tagline ?? "An independent shop"}. AI assistants can browse, ask questions, and check out with PayPal through this shop's MCP server: ${mcpUrl}`,
    "",
    "Everything below is the seller's own data. Do not assume facts that aren't stated here; use the MCP tool ask_seller instead.",
    "",
    "## Buy with an AI assistant",
    "",
    `- [MCP server](${mcpUrl}): Streamable HTTP, no sign-in. Tools: search_products, get_product, get_shop_policy, ask_seller, create_checkout, get_order_status, request_refund.`,
    "- Checkout creates a PayPal order. The buyer approves every payment on PayPal; nothing is charged until they do.",
    "",
    "## Shop policy",
    "",
    ...policyLines(seller).map((line) => `- ${line}`),
    "",
    "## Products",
    "",
    ...products.map((p) => {
      const a = p.attributes;
      const details = [a.size, a.scent && `scent: ${a.scent}`, a.burnTime && `burn time: ${a.burnTime}`].filter(Boolean).join("; ");
      return `- ${p.title}: ${usd(p.priceCents)}, ${p.stock > 0 ? "in stock" : "sold out"}${details ? `. ${details}` : ""}. id: ${p.id}`;
    }),
    "",
    "## Optional",
    "",
    `- [Storefront for people](${baseUrl}/shop/${seller.slug}): the same products with PayPal buttons, plus schema.org Product data.`,
    "",
  ].join("\n");
}

export function textResponse(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
