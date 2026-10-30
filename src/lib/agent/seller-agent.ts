import { generateText, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getFallbackModel, getModel } from "../ai";
import { db, schema } from "../db";
import type { Order, Seller } from "../db/schema";
import { usd } from "../money";
import { CARRIERS, type Carrier } from "../paypal/client";
import { paypalTools } from "../paypal/toolkit";
import { findOrder } from "../shop";
import { markShipped, recordDisputeReview, requestRefund, type ActionResult } from "./actions";
import { DAILY_AUTO_REFUND_CAP_CENTS } from "./guardrails";

/**
 * The seller agent: an LLM with the seller's policy, read-only PayPal Agent Toolkit tools,
 * and a few guarded tools of ours. Anything that moves money or changes a PayPal record
 * goes through src/lib/agent/actions.ts, so the rules hold whatever the model decides.
 */

export type AgentStep = { tool: string; input: unknown; output: unknown };
export type AgentRun = { text: string; steps: AgentStep[] };

function systemPrompt(seller: Seller) {
  const owner = seller.ownerName ?? "the seller";
  return [
    `You are the after-sale agent for ${seller.name}, a small independent shop run by ${owner}.`,
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "Shop policy (the source of truth for every decision):",
    seller.policy ?? "No policy written yet. When in doubt, escalate to the seller.",
    "",
    "Your rules:",
    `- Refunds: refund_order runs automatically up to ${usd(seller.refundAutoLimitCents)} per refund and ${usd(DAILY_AUTO_REFUND_CAP_CENTS)} per day; larger ones go to ${owner} for approval. The tool enforces this, so just call it when the policy supports a refund.`,
    `- If a request isn't covered by the policy, looks wrong, or you're unsure, call escalate_to_seller with your recommendation. Never turn a buyer down yourself.`,
    "- Never refund an order that is in a dispute; review the dispute instead and record your recommendation with record_dispute_review.",
    "- Use lookup_order before acting on an order. Use the PayPal tools only to read (orders, refunds, shipments, disputes, transactions).",
    "- Orders marked demo are seeded history with no real PayPal payment: you can read them but every action on them is blocked.",
    `- Every reason you write is shown to ${owner}: one or two plain sentences, cite the policy line you relied on.`,
    `- Finish with a short summary for ${owner} of what you did and what needs them. No markdown headings.`,
  ].join("\n");
}

/** What the agent sees of an order: no buyer email, nothing it doesn't need. */
async function describeOrder(order: Order) {
  const [product, disputes, actions] = await Promise.all([
    order.productId ? db.query.products.findFirst({ where: eq(schema.products.id, order.productId) }) : undefined,
    db.query.disputes.findMany({ where: eq(schema.disputes.orderId, order.id) }),
    db.query.agentActions.findMany({
      where: eq(schema.agentActions.orderId, order.id),
      orderBy: desc(schema.agentActions.createdAt),
      limit: 5,
    }),
  ]);
  return {
    orderId: order.id,
    paypalOrderId: order.paypalOrderId,
    captureId: order.captureId,
    product: product?.title,
    quantity: order.quantity,
    total: usd(order.amountCents),
    refunded: usd(order.refundedCents),
    leftToRefund: usd(order.amountCents - order.refundedCents),
    status: order.status,
    channel: order.channel === "ai_agent" ? `AI assistant (${order.agentName ?? "unknown"})` : "storefront",
    buyerName: order.buyerName,
    placed: order.createdAt.toISOString().slice(0, 10),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    demo: order.demo,
    disputes: disputes.map((d) => ({
      disputeId: d.id,
      paypalDisputeId: d.paypalDisputeId,
      reason: d.reason,
      status: d.status,
      respondBy: d.responseDueAt?.toISOString().slice(0, 10),
      recommendation: d.aiRecommendation,
    })),
    recentActions: actions.map((a) => ({ tool: a.tool, status: a.status, reason: a.reason })),
  };
}

const money = z.number().positive().optional().describe("Partial amount in USD; omit for everything left on the order");
const reason = z.string().min(10).max(400).describe("One or two sentences for the seller, citing the policy");

function sellerTools(seller: Seller): ToolSet {
  const own = async (id: string) => {
    const order = await findOrder(seller, id);
    if (!order) throw new Error(`No order ${id} in ${seller.name}.`);
    return order;
  };
  const result = (r: ActionResult) => ({ status: r.action.status, message: r.message });
  const cents = (amount?: number) => (amount != null ? Math.round(amount * 100) : undefined);

  return {
    lookup_order: tool({
      description: "Details of one order in this shop: product, amounts, status, tracking, disputes, past agent actions.",
      inputSchema: z.object({ order_id: z.string().describe("AgentShelf order id or PayPal order id") }),
      execute: async ({ order_id }) => describeOrder(await own(order_id)),
    }),
    list_orders: tool({
      description: "Recent orders in this shop, newest first, optionally filtered by status.",
      inputSchema: z.object({
        status: z.enum(schema.orderStatus.enumValues).optional(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ status, limit }) => {
        const rows = await db.query.orders.findMany({
          where: and(eq(schema.orders.sellerId, seller.id), status ? eq(schema.orders.status, status) : undefined),
          orderBy: desc(schema.orders.createdAt),
          limit,
        });
        return rows.map((o) => ({
          orderId: o.id,
          total: usd(o.amountCents),
          status: o.status,
          buyerName: o.buyerName,
          placed: o.createdAt.toISOString().slice(0, 10),
          demo: o.demo,
        }));
      },
    }),
    refund_order: tool({
      description:
        "Refund an order through PayPal when the policy supports it. The shop's limits decide whether it runs now or waits for the seller's approval.",
      inputSchema: z.object({ order_id: z.string(), reason, amount_usd: money }),
      execute: async ({ order_id, reason, amount_usd }) =>
        result(await requestRefund((await own(order_id)).id, reason, { amountCents: cents(amount_usd), note: `Refund from ${seller.name}` })),
    }),
    escalate_to_seller: tool({
      description:
        "Send a refund request to the seller to decide, with your recommendation (refund or decline). Use when the policy doesn't clearly cover it.",
      inputSchema: z.object({ order_id: z.string(), reason, amount_usd: money }),
      execute: async ({ order_id, reason, amount_usd }) =>
        result(
          await requestRefund((await own(order_id)).id, reason, {
            amountCents: cents(amount_usd),
            note: `Refund from ${seller.name}`,
            askSeller: true,
          }),
        ),
    }),
    add_tracking: tool({
      description: "Mark an order shipped and attach the tracking number to its PayPal order (PayPal notifies the buyer).",
      inputSchema: z.object({
        order_id: z.string(),
        carrier: z.enum(Object.keys(CARRIERS) as [Carrier, ...Carrier[]]),
        tracking_number: z.string().regex(/^[A-Za-z0-9]{8,40}$/),
      }),
      execute: async ({ order_id, carrier, tracking_number }) =>
        result(await markShipped((await own(order_id)).id, { carrier, trackingNumber: tracking_number }, "Agent added tracking.")),
    }),
    record_dispute_review: tool({
      description:
        "Save your recommendation on a dispute for the seller (fight with evidence, or accept and refund), with the evidence to use.",
      inputSchema: z.object({
        dispute_id: z.string().describe("disputeId or paypalDisputeId from lookup_order"),
        recommendation: z.string().min(10).max(600),
      }),
      execute: async ({ dispute_id, recommendation }) => {
        const [row] = await db
          .select({ id: schema.disputes.id })
          .from(schema.disputes)
          .innerJoin(schema.orders, eq(schema.disputes.orderId, schema.orders.id))
          .where(
            and(
              eq(schema.orders.sellerId, seller.id),
              /^[0-9a-f-]{36}$/i.test(dispute_id)
                ? eq(schema.disputes.id, dispute_id)
                : eq(schema.disputes.paypalDisputeId, dispute_id),
            ),
          );
        if (!row) throw new Error(`No dispute ${dispute_id} in ${seller.name}.`);
        return result(await recordDisputeReview(row.id, recommendation));
      },
    }),
  };
}

/** Run the seller agent on one task. Returns its summary and every tool call it made. */
export async function runSellerAgent(seller: Seller, task: string, opts: { model?: LanguageModel } = {}): Promise<AgentRun> {
  const steps: AgentStep[] = [];
  let acted = false;

  // Record each call, and note once anything has run so a failed run is never retried on top of it.
  const tools = Object.fromEntries(
    Object.entries({ ...(process.env.PAYPAL_CLIENT_ID ? paypalTools("readOnly") : {}), ...sellerTools(seller) }).map(
      ([name, t]) => [
        name,
        {
          ...t,
          execute: async (input: unknown, options: unknown) => {
            acted = true;
            try {
              const output = await t.execute!(input, options as never);
              steps.push({ tool: name, input, output });
              return output;
            } catch (err) {
              const output = { error: err instanceof Error ? err.message : String(err) };
              steps.push({ tool: name, input, output });
              return output;
            }
          },
        },
      ],
    ),
  ) as ToolSet;

  const go = async (model: LanguageModel) => {
    const { text } = await generateText({
      model,
      system: systemPrompt(seller),
      prompt: task,
      tools,
      stopWhen: stepCountIs(10),
    });
    return { text: text.trim(), steps };
  };

  if (opts.model) return go(opts.model);
  try {
    return await go(getModel("agent"));
  } catch (err) {
    const backup = getFallbackModel("agent");
    if (!backup || acted) throw err;
    console.warn("[agent] primary model failed, using fallback:", err);
    return go(backup);
  }
}

/**
 * A buyer's assistant asked for a refund (MCP request_refund). The agent checks it against
 * the policy and either refunds (within the rules) or hands it to the seller. If the agent
 * doesn't act, the request goes to the seller so it's never silently dropped.
 */
export async function reviewRefundRequest(
  seller: Seller,
  order: Order,
  request: { reason: string; amountCents?: number },
): Promise<ActionResult & { agentSummary?: string }> {
  const started = new Date(Date.now() - 1000);
  const amount = request.amountCents != null ? usd(request.amountCents) : "a full refund";
  const run = await runSellerAgent(
    seller,
    `A buyer's AI assistant is asking for ${amount} on order ${order.id}.\n` +
      `Buyer's reason, in their words: "${request.reason}"\n\n` +
      "Look up the order, check the reason against the shop policy, then call exactly one of refund_order or escalate_to_seller. " +
      "Start your reason with what the buyer said.",
  );

  const action = await db.query.agentActions.findFirst({
    where: and(
      eq(schema.agentActions.orderId, order.id),
      eq(schema.agentActions.tool, "refund_order"),
      gte(schema.agentActions.createdAt, started),
    ),
    orderBy: desc(schema.agentActions.createdAt),
  });
  if (action) {
    const message =
      action.status === "auto" ? "Refunded under the shop's rules." :
      action.status === "pending_approval" ? "Sent to the seller to approve." :
      action.status === "blocked" ? (action.reason ?? "Not eligible for a refund.") :
      "The refund didn't go through; the seller has been notified.";
    return { action, message, agentSummary: run.text };
  }

  const fallback = await requestRefund(order.id, `Buyer's assistant: "${request.reason}" The agent didn't decide, so this needs you.`, {
    amountCents: request.amountCents,
    note: `Refund from ${seller.name}`,
    askSeller: true,
  });
  return { ...fallback, agentSummary: run.text };
}

/** A new dispute arrived (webhook): the agent reviews it and records a recommendation. */
export async function reviewDispute(disputeId: string) {
  const dispute = await db.query.disputes.findFirst({ where: eq(schema.disputes.id, disputeId) });
  if (!dispute) return;
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, dispute.orderId) });
  const seller = order && (await db.query.sellers.findFirst({ where: eq(schema.sellers.id, order.sellerId) }));
  if (!order || !seller) return;
  return runSellerAgent(
    seller,
    `PayPal opened dispute ${dispute.paypalDisputeId} (${dispute.reason ?? "no reason given"}) on order ${order.id}. ` +
      "Look up the order and the dispute, weigh the evidence (tracking, policy, history), and record your recommendation with record_dispute_review.",
  );
}

