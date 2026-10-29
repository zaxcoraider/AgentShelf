import assert from "node:assert/strict";
import { test } from "node:test";
import { DAILY_AUTO_REFUND_CAP_CENTS, decideRefund } from "./guardrails";

const seller = { refundAutoLimitCents: 3000 };
const paid = { status: "paid" as const, demo: false, captureId: "CAP1", amountCents: 2795, refundedCents: 0 };
const decide = (overrides: Partial<Parameters<typeof decideRefund>[0]> = {}) =>
  decideRefund({ seller, order: paid, autoRefundedTodayCents: 0, ...overrides });

test("full refund under the limit runs automatically", () => {
  assert.deepEqual(decide(), { kind: "auto", amountCents: 2795, why: "$27.95 is within the $30.00 auto-refund limit." });
});

test("over the limit waits for the seller", () => {
  const r = decide({ order: { ...paid, amountCents: 4500 } });
  assert.equal(r.kind, "needs_approval");
  assert.equal(r.kind === "needs_approval" && r.amountCents, 4500);
});

test("exactly at the limit is still automatic", () => {
  assert.equal(decide({ order: { ...paid, amountCents: 3000 } }).kind, "auto");
});

test("partial refund refunds only what was asked", () => {
  const r = decide({ order: { ...paid, amountCents: 4500 }, amountCents: 1000 });
  assert.deepEqual(r.kind === "auto" && r.amountCents, 1000);
});

test("daily cap sends otherwise-small refunds to approval", () => {
  const r = decide({ autoRefundedTodayCents: DAILY_AUTO_REFUND_CAP_CENTS - 1000 });
  assert.equal(r.kind, "needs_approval");
});

test("never refunds more than what is left", () => {
  const r = decide({ order: { ...paid, refundedCents: 2000 }, amountCents: 1000 });
  assert.equal(r.kind, "blocked");
  assert.match(r.why, /Only \$7\.95 is left/);
});

test("a full refund after a partial one refunds only the remainder", () => {
  const r = decide({ order: { ...paid, status: "partially_refunded", refundedCents: 2000 } });
  assert.deepEqual(r.kind === "auto" && r.amountCents, 795);
});

test("blocks demo, unpaid, disputed, and fully refunded orders", () => {
  assert.equal(decide({ order: { ...paid, demo: true } }).kind, "blocked");
  assert.equal(decide({ order: { ...paid, status: "created", captureId: null } }).kind, "blocked");
  assert.equal(decide({ order: { ...paid, status: "disputed" } }).kind, "blocked");
  assert.equal(decide({ order: { ...paid, status: "refunded", refundedCents: 2795 } }).kind, "blocked");
});

test("rejects zero, negative, and fractional amounts", () => {
  for (const amountCents of [0, -500, 12.5]) assert.equal(decide({ amountCents }).kind, "blocked");
});
