import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { tool, type ToolSet } from "ai";
import type { z } from "zod";

/**
 * PayPal Agent Toolkit tools for the seller agent.
 *
 * The toolkit is built on AI SDK v4 (`parameters`), while we use v7 (`inputSchema`),
 * so each toolkit tool is re-wrapped as a v7 tool. Its zod schemas and PayPal calls
 * are used unchanged.
 */

type V4Tool = {
  description?: string;
  parameters: z.ZodType<Record<string, unknown>>;
  execute: (args: unknown, options: unknown) => Promise<unknown>;
};

/** Every toolkit action AgentShelf uses (smoke tests, catalog onboarding). */
const SELLER_ACTIONS = {
  products: { create: true, list: true, show: true },
  orders: { get: true },
  payments: { createRefund: true, getRefunds: true },
  shipment: { create: true, get: true },
  disputes: { list: true, get: true, create: true }, // `create` = accept_dispute_claim
  invoices: { create: true, send: true, list: true, get: true },
  transactions: { list: true },
  insights: { get: true },
};

/**
 * What the seller agent gets: look, never touch. Refunds and tracking go through our
 * guarded tools (src/lib/agent), so create_refund, create_shipment_tracking,
 * accept_dispute_claim, and invoice sending are left out on purpose.
 */
const READ_ONLY_ACTIONS = {
  products: { list: true, show: true },
  orders: { get: true },
  payments: { getRefunds: true },
  shipment: { get: true },
  disputes: { list: true, get: true },
  invoices: { list: true, get: true },
  transactions: { list: true },
  insights: { get: true },
};

const PRESETS = { seller: SELLER_ACTIONS, readOnly: READ_ONLY_ACTIONS };
const toolkits = new Map<keyof typeof PRESETS, PayPalAgentToolkit>();

function getToolkit(preset: keyof typeof PRESETS) {
  let toolkit = toolkits.get(preset);
  if (!toolkit) {
    toolkit = new PayPalAgentToolkit({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      configuration: { actions: PRESETS[preset], context: { sandbox: true } },
    });
    toolkits.set(preset, toolkit);
  }
  return toolkit;
}

export function paypalTools(preset: keyof typeof PRESETS = "seller"): ToolSet {
  const raw = getToolkit(preset).getTools() as unknown as Record<string, V4Tool>;
  return Object.fromEntries(
    Object.entries(raw).map(([name, t]) => [
      name,
      tool({
        description: t.description,
        inputSchema: t.parameters,
        execute: (args) => t.execute(args, {}),
      }),
    ]),
  );
}

/**
 * Create a product in the seller's PayPal catalog with the toolkit's own create_product tool,
 * called directly (no model in the loop) so a published listing always lands in PayPal.
 */
export async function createCatalogProduct(input: {
  name: string;
  description: string;
  imageUrl?: string;
  homeUrl?: string;
}): Promise<string> {
  const raw = getToolkit("seller").getTools() as unknown as Record<string, V4Tool>;
  const result = await raw.create_product.execute(
    {
      name: input.name.slice(0, 127),
      type: "PHYSICAL",
      description: input.description.slice(0, 256),
      image_url: input.imageUrl,
      home_url: input.homeUrl,
    },
    {},
  );
  const body = (typeof result === "string" ? JSON.parse(result) : result) as { id?: string; message?: string };
  if (!body?.id) throw new Error(`PayPal didn't create the product: ${JSON.stringify(body).slice(0, 300)}`);
  return body.id;
}
