import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Seller } from "../db/schema";
import { aiConfigured } from "../ai";
import { requestRefund } from "../agent/actions";
import { reviewRefundRequest } from "../agent/seller-agent";
import {
  askSeller,
  findOrder,
  getProduct,
  MAX_QUANTITY,
  orderStatus,
  publicProduct,
  searchProducts,
  SHIPPING_CENTS,
  ShopError,
  startCheckout,
  usd,
} from "../shop";

/**
 * One MCP server per shop. AI assistants connect to /api/mcp/<slug> and can browse,
 * ask questions, and check out through a PayPal order the human approves.
 */

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Turn known errors into tool errors the calling AI can read; let real bugs surface. */
async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ShopError) return fail(err.message);
    console.error("[mcp] tool failed:", err);
    return fail("Something went wrong on the shop's side. Please try again in a moment.");
  }
}

/** Best guess at which assistant is calling, from its User-Agent, when it doesn't say. */
export function agentFromUserAgent(userAgent: string | null): string | undefined {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("claude")) return "Claude";
  if (ua.includes("openai") || ua.includes("chatgpt")) return "ChatGPT";
  if (ua.includes("perplexity")) return "Perplexity";
  if (ua.includes("gemini") || ua.includes("google")) return "Gemini";
  return undefined;
}

export function createShopServer(seller: Seller, opts: { detectedAgent?: string } = {}) {
  const server = new McpServer(
    { name: `agentshelf-${seller.slug}`, version: "1.0.0" },
    {
      instructions:
        `${seller.name}: ${seller.tagline ?? "an independent shop"}. ` +
        "Use search_products to browse, ask_seller for questions the listing doesn't answer, " +
        "and create_checkout to buy. Checkout returns a PayPal link: always show it to the user, " +
        "who must approve the payment themselves. Never claim an order is paid until get_order_status says so. " +
        "If something went wrong with an order, use request_refund with the email the buyer paid with.",
    },
  );

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description: `Search the ${seller.name} catalog. Leave query empty to list everything. Prices are USD; shipping is a flat ${usd(SHIPPING_CENTS)}.`,
      inputSchema: {
        query: z.string().optional().describe("Keywords, e.g. 'lavender' or 'gift set'"),
        max_price_usd: z.number().positive().optional().describe("Only products at or under this price"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, max_price_usd }) =>
      run(async () => {
        const results = await searchProducts(seller, {
          query,
          maxPriceCents: max_price_usd != null ? Math.round(max_price_usd * 100) : undefined,
        });
        return ok({ shop: seller.name, count: results.length, products: results });
      }),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description: "Full details for one product: description, attributes (materials, size, scent), price, stock.",
      inputSchema: { product_id: z.string().describe("Product id from search_products") },
      annotations: { readOnlyHint: true },
    },
    ({ product_id }) =>
      run(async () => {
        const product = await getProduct(seller, product_id);
        return product ? ok(publicProduct(product)) : fail(`No product with id ${product_id}.`);
      }),
  );

  server.registerTool(
    "ask_seller",
    {
      title: "Ask the seller",
      description:
        "Ask a question about a product or the shop (materials, shipping times, returns, custom orders). " +
        "Answers come only from the seller's own policy and listings.",
      inputSchema: {
        question: z.string().min(3).describe("The shopper's question"),
        product_id: z.string().optional().describe("The product the question is about, if any"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ question, product_id }) =>
      run(async () => {
        const product = product_id ? await getProduct(seller, product_id) : undefined;
        if (product_id && !product) return fail(`No product with id ${product_id}.`);
        const { answer, facts } = await askSeller(seller, question, product);
        return ok(answer ? { answer } : { note: "Answer the question from these facts from the seller.", facts });
      }),
  );

  server.registerTool(
    "create_checkout",
    {
      title: "Create checkout",
      description:
        "Start buying a product. Creates a PayPal order and returns an approval link. " +
        "The user must open the link and approve the payment with PayPal; nothing is charged until they do. " +
        `Max ${MAX_QUANTITY} per order.`,
      inputSchema: {
        product_id: z.string().describe("Product id from search_products"),
        quantity: z.number().int().min(1).max(MAX_QUANTITY).default(1),
        assistant_name: z
          .string()
          .max(40)
          .optional()
          .describe("Your name as an AI assistant (e.g. 'Claude'), so the seller sees where the order came from"),
      },
    },
    ({ product_id, quantity, assistant_name }) =>
      run(async () => {
        const checkout = await startCheckout(seller, {
          productId: product_id,
          quantity,
          channel: "ai_agent",
          agentName: assistant_name?.trim() || opts.detectedAgent || "AI assistant",
        });
        return ok({
          ...checkout,
          next_step: `Show the user this link to approve the ${checkout.total} payment with PayPal: ${checkout.approveUrl}. Then use get_order_status with orderId ${checkout.orderId} to confirm.`,
        });
      }),
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description: "Check an order: payment status, shipping carrier and tracking number.",
      inputSchema: { order_id: z.string().describe("orderId from create_checkout (or the PayPal order id)") },
      annotations: { readOnlyHint: true },
    },
    ({ order_id }) =>
      run(async () => {
        const status = await orderStatus(seller, order_id);
        return status ? ok(status) : fail(`No order ${order_id} at ${seller.name}.`);
      }),
  );

  server.registerTool(
    "request_refund",
    {
      title: "Request a refund",
      description:
        "Ask the seller for a refund on a paid order, on the buyer's behalf. Requires the email the buyer paid with. " +
        `${seller.name}'s rules decide the outcome: small refunds are processed right away, larger ones wait for the seller to approve. ` +
        "Report the outcome to the user exactly as returned; don't promise money that hasn't been refunded.",
      inputSchema: {
        order_id: z.string().describe("orderId from create_checkout (or the PayPal order id)"),
        buyer_email: z.string().email().describe("The email address the buyer paid with on PayPal"),
        reason: z.string().min(5).max(500).describe("What went wrong, in the buyer's words"),
        amount_usd: z.number().positive().optional().describe("Partial refund amount; omit for a full refund"),
      },
    },
    ({ order_id, buyer_email, reason, amount_usd }) =>
      run(async () => {
        const order = await findOrder(seller, order_id);
        // Same message whether the order is missing or the email doesn't match, so ids can't be probed.
        if (!order || order.buyerEmail?.toLowerCase() !== buyer_email.trim().toLowerCase()) {
          return fail("No paid order matches that order id and email.");
        }
        const amountCents = amount_usd != null ? Math.round(amount_usd * 100) : undefined;
        // With a model configured the seller agent reviews the reason against the policy first;
        // without one, the guardrails alone decide.
        const result = aiConfigured("agent")
          ? await reviewRefundRequest(seller, order, { reason: reason.trim(), amountCents })
          : await requestRefund(order.id, `Buyer's assistant: "${reason.trim()}"`, {
              amountCents,
              note: `Refund from ${seller.name}`,
            });
        const outcome = {
          auto: "refunded",
          pending_approval: "waiting_for_seller",
          blocked: "not_eligible",
          failed: "error",
          approved: "refunded",
          rejected: "declined",
        }[result.action.status];
        return ok({ outcome, message: result.message, orderId: order.id });
      }),
  );

  return server;
}
