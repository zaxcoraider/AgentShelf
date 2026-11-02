import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { AI_LIMITS, clientIp, resetLimits, takeAiCall } from "./rate-limit";

beforeEach(resetLimits);

test("a shop gets its full hourly allowance, then a friendly message", () => {
  const now = 1_000_000;
  for (let i = 0; i < AI_LIMITS.agent.max; i++) assert.equal(takeAiCall("agent", "shop-a", now).ok, true);
  const over = takeAiCall("agent", "shop-a", now);
  assert.equal(over.ok, false);
  assert.match(!over.ok ? over.message : "", /fair-use limit/);
});

test("limits are per shop and per feature, and reset after the window", () => {
  const now = 1_000_000;
  for (let i = 0; i < AI_LIMITS.agent.max; i++) takeAiCall("agent", "shop-a", now);
  assert.equal(takeAiCall("agent", "shop-b", now).ok, true);
  assert.equal(takeAiCall("listing", "shop-a", now).ok, true);
  assert.equal(takeAiCall("agent", "shop-a", now + AI_LIMITS.agent.windowMs).ok, true);
});

test("the site-wide daily ceiling stops everyone", () => {
  const now = 1_000_000;
  for (let i = 0; i < AI_LIMITS.siteDaily.max; i++) takeAiCall("ask", `ip:${i}`, now);
  const over = takeAiCall("ask", "ip:someone-new", now);
  assert.equal(over.ok, false);
  assert.match(!over.ok ? over.message : "", /resting for today/);
});

test("client IP comes from the first forwarded address", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers()), "unknown");
});
