import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentFromUserAgent, createShopServer } from "@/lib/mcp/shop-server";
import { getShop } from "@/lib/shop";

/**
 * Remote MCP endpoint for one shop (Streamable HTTP, stateless).
 * Each request gets a fresh server + transport, so nothing lives in memory between calls.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seller = await getShop(slug);
  if (!seller) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: `No shop "${slug}"` }, id: null },
      { status: 404 },
    );
  }

  const server = createShopServer(seller, { detectedAgent: agentFromUserAgent(request.headers.get("user-agent")) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

// Stateless JSON server: no standalone SSE stream to open and no session to end, so GET and DELETE
// get 405 as the spec allows. (A held-open GET stalls clients like mcp-remote.)
const notAllowed = () =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } },
  );

export { handle as POST, notAllowed as GET, notAllowed as DELETE };
