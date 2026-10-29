/**
 * Shop like an AI assistant would: connect to the shop's MCP server and walk the demo path.
 * Needs the app running (npm run dev). Creates a real PayPal sandbox order at the end.
 * Run: npm run smoke:mcp [baseUrl] [slug]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
const slug = process.argv[3] ?? "mayas-candles";

const client = new Client({ name: "agentshelf-smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`/api/mcp/${slug}`, baseUrl)));
console.log("Connected. Instructions:", client.getInstructions());

const { tools } = await client.listTools();
console.log("Tools:", tools.map((t) => t.name).join(", "));

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  console.log(`\n▶ ${name} ${JSON.stringify(args)}${result.isError ? " (ERROR)" : ""}\n${text}`);
  if (result.isError) throw new Error(`${name} failed`);
  return JSON.parse(text);
}

const found = await call("search_products", { query: "lavender candle", max_price_usd: 25 });
const product = found.products[0];
if (!product) throw new Error("Expected a lavender candle under $25");

await call("get_product", { product_id: product.id });
await call("ask_seller", { product_id: product.id, question: "Is it soy wax?" });
const checkout = await call("create_checkout", { product_id: product.id, quantity: 1, assistant_name: "Claude" });
await call("get_order_status", { order_id: checkout.orderId });

console.log(`\n✅ Demo path works. Approve as the sandbox buyer to finish: ${checkout.approveUrl}`);
await client.close();
