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

/** Toolkit actions the seller agent may use. Everything else stays off. */
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

let toolkit: PayPalAgentToolkit | null = null;

function getToolkit() {
  toolkit ??= new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    configuration: { actions: SELLER_ACTIONS, context: { sandbox: true } },
  });
  return toolkit;
}

export function paypalTools(): ToolSet {
  const raw = getToolkit().getTools() as unknown as Record<string, V4Tool>;
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
