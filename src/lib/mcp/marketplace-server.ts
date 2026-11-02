import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { requestRefund } from "../agent/actions";
import { reviewRefundRequest } from "../agent/seller-agent";
import { aiConfigured } from "../ai";
import { db, schema } from "../db";
import {
  findListedProduct,
  findListedShop,
  listedShops,
  searchMarketplace,
  sellerForOrder,
  shopCard,
  withShop,
} from "../marketplace";
import { askSeller, findOrder, MAX_QUANTITY, orderStatus, ShopError, startCheckout } from "../shop";
import { publicPolicy } from "../shop-facts";
import { PRODUCT_WIDGET_URI, productWidgetHtml } from "./product-widget";

/**
 * The AgentShelf marketplace MCP server (/api/mcp): every listed shop behind one connector.
 * Search spans all shops and each result names its shop. Product, order and refund tools find the
 * right shop from the id, so each shop's own facts, refund rules and seller agent still decide.
 * Shops keep their own servers at /api/mcp/<shop> too.
 */

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ShopError) return fail(err.message);
    console.error("[mcp marketplace] tool failed:", err);
    return fail("Something went wrong on AgentShelf's side. Please try again in a moment.");
  }
}

const NAME = "AgentShelf marketplace";

export function createMarketplaceServer(opts: { detectedAgent?: string; caller?: string } = {}) {
  const server = new McpServer(
    { name: "agentshelf-marketplace", version: "1.0.0" },
    {
      instructions:
        `${NAME}: independent shops, each with its own products, policy and seller. ` +
        "Use search_products to browse every shop at once (each result names its shop); list_shops to see the shops. " +
        "Shipping, returns and materials differ by shop: use get_shop_policy with that shop, or ask_seller, and never assume. " +
        "create_checkout returns a PayPal link for that shop's order: always show it to the user, who must approve the payment. " +
        "Buying from two shops means two checkouts. Never claim an order is paid until get_order_status says so. " +
        "Demo shops (demo: true) were made by visitors trying AgentShelf; everything runs in the PayPal sandbox.",
    },
  );

  const productCards = { ui: { resourceUri: PRODUCT_WIDGET_URI } };
  registerAppResource(server, "Product cards", PRODUCT_WIDGET_URI, { description: `Product cards across ${NAME} with PayPal checkout` }, async () => ({
    contents: [{ uri: PRODUCT_WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: productWidgetHtml() }],
  }));

  registerAppTool(
    server,
    "search_products",
    {
      title: "Search products across shops",
      description:
        "Search every AgentShelf shop at once. Leave query empty to browse. Prices are USD; each result includes its shop " +
        "(name, where it ships from and to, shipping cost). Pass shop to search one shop only. " +
        "In apps that support it, results show as product cards with a Buy with PayPal button.",
      inputSchema: {
        query: z.string().optional().describe("Keywords, e.g. 'mug', 'lavender candle', 'silver ring'"),
        max_price_usd: z.number().positive().optional().describe("Only products at or under this price"),
        shop: z.string().optional().describe("Limit to one shop (name or id from list_shops)"),
      },
      annotations: { readOnlyHint: true },
      _meta: productCards,
    },
    ({ query, max_price_usd, shop }) =>
      run(async () => {
        const products = await searchMarketplace({
          query,
          shop,
          maxPriceCents: max_price_usd != null ? Math.round(max_price_usd * 100) : undefined,
        });
        const shops = new Set(products.map((p) => p.shop.shop)).size;
        return ok({ shop: `${NAME} · ${shops} shop${shops === 1 ? "" : "s"}`, count: products.length, products });
      }),
  );

  server.registerTool(
    "list_shops",
    {
      title: "List shops",
      description: "The shops in the AgentShelf marketplace: name, what they sell, where they ship, and how many products are on sale.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const shops = await listedShops();
        return ok({ marketplace: NAME, shops: shops.map((s) => ({ ...shopCard(s.seller), productsOnSale: s.products })) });
      }),
  );

  registerAppTool(
    server,
    "get_product",
    {
      title: "Get product details",
      description: "Full details for one product (any shop), with its shop. In apps that support it, shows a product card with Buy with PayPal.",
      inputSchema: { product_id: z.string().describe("Product id from search_products") },
      annotations: { readOnlyHint: true },
      _meta: productCards,
    },
    ({ product_id }) =>
      run(async () => {
        const found = await findListedProduct(product_id);
        return found ? ok(withShop(found.product, found.seller)) : fail(`No product with id ${product_id}.`);
      }),
  );

  registerAppTool(
    server,
    "get_product_photos",
    {
      title: "Get product photos",
      description: "Thumbnails for the product cards.",
      inputSchema: { product_ids: z.array(z.string()).max(24) },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: PRODUCT_WIDGET_URI, visibility: ["app"] } },
    },
    ({ product_ids }) =>
      run(async () => {
        const ids = product_ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        if (!ids.length) return ok({ photos: {} });
        const rows = await db
          .select({ id: schema.productImages.productId, data: schema.productImages.data })
          .from(schema.productImages)
          .innerJoin(schema.products, eq(schema.products.id, schema.productImages.productId))
          .innerJoin(schema.sellers, eq(schema.sellers.id, schema.products.sellerId))
          .where(
            and(
              inArray(schema.productImages.productId, ids),
              eq(schema.sellers.marketplace, true),
              or(isNull(schema.sellers.expiresAt), gt(schema.sellers.expiresAt, new Date())),
            ),
          );
        const photos = Object.fromEntries(
          await Promise.all(
            rows.map(async (r) => {
              const thumb = await sharp(r.data).resize(480, 360, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
              return [r.id, `data:image/jpeg;base64,${thumb.toString("base64")}`] as const;
            }),
          ),
        );
        return ok({ photos });
      }),
  );

  server.registerTool(
    "get_shop_policy",
    {
      title: "Get a shop's policy",
      description:
        "One shop's shipping (from where, which countries, how long, cost), returns, damage policy and materials. " +
        "Policies differ between shops: answer from the right shop's facts. If a country isn't listed, that shop doesn't ship there.",
      inputSchema: { shop: z.string().describe("Shop name or id, as in search results or list_shops") },
      annotations: { readOnlyHint: true },
    },
    ({ shop }) =>
      run(async () => {
        const seller = await findListedShop(shop);
        return seller ? ok(publicPolicy(seller)) : fail(`No shop "${shop}". Use list_shops to see the shops.`);
      }),
  );

  server.registerTool(
    "ask_seller",
    {
      title: "Ask a seller",
      description:
        "Ask one shop a question about a product or the shop (materials, shipping, returns, custom orders). " +
        "Give product_id (its shop is found for you) or shop. Answers come only from that seller's own policy and listings.",
      inputSchema: {
        question: z.string().min(3).max(1000).describe("The shopper's question"),
        product_id: z.string().optional().describe("The product the question is about"),
        shop: z.string().optional().describe("The shop, if the question isn't about one product"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ question, product_id, shop }) =>
      run(async () => {
        const found = product_id ? await findListedProduct(product_id) : undefined;
        if (product_id && !found) return fail(`No product with id ${product_id}.`);
        const seller = found?.seller ?? (shop ? await findListedShop(shop) : undefined);
        if (!seller) return fail("Say which shop: pass product_id or shop (see list_shops).");
        const { answer, facts } = await askSeller(seller, question, found?.product, { caller: opts.caller });
        return ok({ shop: seller.name, ...(answer ? { answer } : { note: "Answer from these facts from the seller.", facts }) });
      }),
  );

  server.registerTool(
    "create_checkout",
    {
      title: "Create checkout",
      description:
        "Start buying one product. Creates a PayPal order with that product's shop and returns an approval link. " +
        "The user must open the link and approve the payment with PayPal; nothing is charged until they do. " +
        `One shop per checkout; max ${MAX_QUANTITY} per order.`,
      inputSchema: {
        product_id: z.string().describe("Product id from search_products"),
        quantity: z.number().int().min(1).max(MAX_QUANTITY).default(1),
        assistant_name: z.string().max(40).optional().describe("Your name as an AI assistant (e.g. 'Claude'), so the seller sees where the order came from"),
      },
    },
    ({ product_id, quantity, assistant_name }) =>
      run(async () => {
        const found = await findListedProduct(product_id);
        if (!found) return fail(`No product with id ${product_id}.`);
        const checkout = await startCheckout(found.seller, {
          productId: product_id,
          quantity,
          channel: "ai_agent",
          agentName: assistant_name?.trim() || opts.detectedAgent || "AI assistant",
        });
        return ok({
          shop: found.seller.name,
          ...checkout,
          next_step: `Show the user this link to approve the ${checkout.total} payment to ${found.seller.name} with PayPal: ${checkout.approveUrl}. Then use get_order_status with orderId ${checkout.orderId} to confirm.`,
        });
      }),
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description: "Check an order from any shop: payment status, shipping carrier and tracking number.",
      inputSchema: { order_id: z.string().describe("orderId from create_checkout (or the PayPal order id)") },
      annotations: { readOnlyHint: true },
    },
    ({ order_id }) =>
      run(async () => {
        const seller = await sellerForOrder(order_id);
        const status = seller ? await orderStatus(seller, order_id) : undefined;
        return status ? ok({ shop: seller!.name, ...status }) : fail(`No order ${order_id}.`);
      }),
  );

  server.registerTool(
    "request_refund",
    {
      title: "Request a refund",
      description:
        "Ask the order's shop for a refund on the buyer's behalf. Requires the email the buyer paid with. " +
        "That shop's own rules decide: small refunds are processed right away, larger ones wait for the seller. " +
        "Report the outcome exactly as returned; don't promise money that hasn't been refunded.",
      inputSchema: {
        order_id: z.string().describe("orderId from create_checkout (or the PayPal order id)"),
        buyer_email: z.string().email().describe("The email address the buyer paid with on PayPal"),
        reason: z.string().min(5).max(500).describe("What went wrong, in the buyer's words"),
        amount_usd: z.number().positive().optional().describe("Partial refund amount; omit for a full refund"),
      },
    },
    ({ order_id, buyer_email, reason, amount_usd }) =>
      run(async () => {
        const seller = await sellerForOrder(order_id);
        const order = seller ? await findOrder(seller, order_id) : undefined;
        // Same message whether the order is missing or the email doesn't match, so ids can't be probed.
        if (!seller || !order || order.buyerEmail?.toLowerCase() !== buyer_email.trim().toLowerCase()) {
          return fail("No paid order matches that order id and email.");
        }
        const amountCents = amount_usd != null ? Math.round(amount_usd * 100) : undefined;
        const result = aiConfigured("agent")
          ? await reviewRefundRequest(seller, order, { reason: reason.trim(), amountCents })
          : await requestRefund(order.id, `Buyer's assistant: "${reason.trim()}"`, { amountCents, note: `Refund from ${seller.name}` });
        const outcome = {
          auto: "refunded",
          pending_approval: "waiting_for_seller",
          blocked: "not_eligible",
          failed: "error",
          approved: "refunded",
          rejected: "declined",
        }[result.action.status];
        return ok({ shop: seller.name, outcome, message: result.message, orderId: order.id });
      }),
  );

  return server;
}
