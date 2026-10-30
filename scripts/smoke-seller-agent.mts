/**
 * Run the seller agent against the local database.
 *   npm run smoke:seller-agent -- --mock   scripted fake model: checks the tool wiring and guardrails, no AI key or PayPal calls
 *   npm run smoke:seller-agent             the configured model reviews the open disputes (writes recommendations)
 * Stop `next dev/start` first when using local PGlite.
 */
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { runSellerAgent } from "../src/lib/agent/seller-agent";
import { db, schema } from "../src/lib/db";
import { currentSeller } from "../src/lib/seller";

const seller = await currentSeller();

if (!process.argv.includes("--mock")) {
  const run = await runSellerAgent(seller, "Review the open disputes and record a recommendation for each. Then tell me which paid orders still need to ship.");
  for (const step of run.steps) console.log(`→ ${step.tool} ${JSON.stringify(step.input)}\n  ${JSON.stringify(step.output).slice(0, 240)}`);
  console.log(`\nAgent: ${run.text}`);
  process.exit(0);
}

// A throwaway paid order, a seeded demo order, and a seeded dispute to act on.
const [order] = await db
  .insert(schema.orders)
  .values({ sellerId: seller.id, channel: "ai_agent", agentName: "Claude", amountCents: 2795, status: "paid", captureId: `SMOKE-${Date.now()}` })
  .returning();
const demo = await db.query.orders.findFirst({ where: and(eq(schema.orders.sellerId, seller.id), eq(schema.orders.demo, true), eq(schema.orders.status, "shipped")) });
const [dispute] = await db
  .select({ id: schema.disputes.paypalDisputeId })
  .from(schema.disputes)
  .innerJoin(schema.orders, eq(schema.disputes.orderId, schema.orders.id))
  .where(eq(schema.orders.sellerId, seller.id))
  .limit(1);
assert(demo && dispute?.id, "Needs seeded demo data: npm run db:seed -- --reset");

// The fake model's plan: one tool call per step, then a summary.
const plan: [string, Record<string, unknown>][] = [
  ["lookup_order", { order_id: order.id }],
  ["escalate_to_seller", { order_id: order.id, reason: "Buyer says the scent is too strong. The policy only covers unused or damaged candles, so I recommend declining." }],
  ["refund_order", { order_id: demo.id, reason: "Buyer says the jar arrived cracked; the policy gives a full refund for transit damage." }],
  ["record_dispute_review", { dispute_id: dispute.id, recommendation: "Tracking shows delivery; fight it and attach the USPS tracking as evidence." }],
  ["lookup_order", { order_id: "00000000-0000-0000-0000-000000000000" }],
];
let step = 0;
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } };
const model = new MockLanguageModelV4({
  doGenerate: async () => {
    const next = plan[step++];
    return next
      ? { content: [{ type: "tool-call", toolCallId: `c${step}`, toolName: next[0], input: JSON.stringify(next[1]) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] }
      : { content: [{ type: "text", text: "Escalated one refund, the demo refund was blocked, dispute reviewed." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
  },
});

try {
  const run = await runSellerAgent(seller, "Handle today's after-sale work.", { model });
  for (const s of run.steps) console.log(`→ ${s.tool}: ${JSON.stringify(s.output).slice(0, 160)}`);

  assert.equal(run.steps.length, plan.length);
  assert.equal((run.steps[0].output as { total: string }).total, "$27.95");
  assert.equal((run.steps[1].output as { status: string }).status, "pending_approval", "escalation waits for the seller even under the limit");
  assert.equal((run.steps[2].output as { status: string }).status, "blocked", "demo orders are never refunded");
  assert.equal((run.steps[3].output as { status: string }).status, "auto");
  assert.match((run.steps[4].output as { error: string }).error, /No order/, "tool errors go back to the model instead of crashing");
  console.log(`\nAgent: ${run.text}\n✅ Seller agent wiring works.`);
} finally {
  await db.delete(schema.agentActions).where(inArray(schema.agentActions.orderId, [order.id]));
  await db.delete(schema.orders).where(eq(schema.orders.id, order.id));
}
process.exit(0);
