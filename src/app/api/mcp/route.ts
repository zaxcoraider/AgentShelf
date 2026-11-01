import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMarketplaceServer } from "@/lib/mcp/marketplace-server";
import { agentFromUserAgent } from "@/lib/mcp/shop-server";

/**
 * The AgentShelf marketplace MCP endpoint: every listed shop behind one connector (Streamable HTTP,
 * stateless). Each shop also has its own endpoint at /api/mcp/<shop>.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const server = createMarketplaceServer({ detectedAgent: agentFromUserAgent(request.headers.get("user-agent")) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

// Stateless JSON server, as for the per-shop endpoint: no SSE stream, so GET and DELETE get 405.
const notAllowed = () =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } },
  );

export { handle as POST, notAllowed as GET, notAllowed as DELETE };
