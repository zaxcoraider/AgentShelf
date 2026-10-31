import { asc } from "drizzle-orm";
import { requestBaseUrl } from "@/lib/base-url";
import { db, schema } from "@/lib/db";
import { textResponse } from "@/lib/llms-txt";

// Site-wide llms.txt: what AgentShelf is and where each shop's MCP server and facts live.
export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = await requestBaseUrl();
  const shops = await db.query.sellers.findMany({ orderBy: asc(schema.sellers.name) });
  return textResponse(
    [
      "# AgentShelf",
      "",
      "> Small shops that AI assistants can buy from. Each shop has its own MCP server for browsing, questions, and PayPal checkout (the buyer approves every payment), and a seller agent that handles refunds, tracking, and disputes within the seller's rules.",
      "",
      "## Shops",
      "",
      ...shops.map(
        (s) =>
          `- [${s.name}](${baseUrl}/shop/${s.slug}/llms.txt): ${s.tagline ?? "an independent shop"}. MCP server: ${baseUrl}/api/mcp/${s.slug}`,
      ),
      "",
      "## Optional",
      "",
      "- [Source code](https://github.com/zaxcoraider/AgentShelf)",
      "",
    ].join("\n"),
  );
}
