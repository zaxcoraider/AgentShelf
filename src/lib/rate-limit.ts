/**
 * Fair-use limits for everything that spends AI credit. Generous on purpose: a judge clicking
 * around, even hard, never meets them; a script looping on a free visitor shop does. Counters live
 * in memory (one Render instance), so a deploy resets them, which is fine for a ceiling.
 *
 * Two layers: a per-shop / per-visitor hourly limit, and a site-wide daily ceiling so the AI
 * credit can never be drained in one day whatever the mix of callers.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const AI_LIMITS = {
  /** AG Studio dashboard: one "build me a page" run is dozens of model turns across five agents. */
  studio: { max: 600, windowMs: HOUR },
  /** Inbox "Ask your agent" runs (each can take several model steps). */
  agent: { max: 60, windowMs: HOUR },
  /** Photo → listing drafts (vision). */
  listing: { max: 60, windowMs: HOUR },
  /** ask_seller from AI's view or an assistant over MCP, per shop or per visitor IP. */
  ask: { max: 200, windowMs: HOUR },
  /** Every AI call on the site, per day. */
  siteDaily: { max: 10_000, windowMs: DAY },
} as const;

export type AiFeature = Exclude<keyof typeof AI_LIMITS, "siteDaily">;

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

function take(key: string, { max, windowMs }: { max: number; windowMs: number }, now: number) {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const };
  }
  if (w.count >= max) return { ok: false as const, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
  w.count++;
  return { ok: true as const };
}

/** Checkouts (unpaid PayPal orders) per visitor per hour, and for the whole site per day. */
export const CHECKOUT_LIMITS = {
  perVisitor: { max: 60, windowMs: HOUR },
  siteDaily: { max: 3_000, windowMs: DAY },
} as const;

/** Count one checkout for `who` (a visitor IP). Generous: a real shopper makes a handful. */
export function takeCheckout(who: string, now = Date.now()): LimitResult {
  if (windows.size > 50_000) sweep(now);
  const mine = take(`checkout:${who}`, CHECKOUT_LIMITS.perVisitor, now);
  if (!mine.ok) {
    const minutes = Math.max(1, Math.ceil(mine.retryAfterSec / 60));
    return { ok: false, retryAfterSec: mine.retryAfterSec, message: `Too many checkouts started from here. Try again in ${minutes} min.` };
  }
  const site = take("checkout:site", CHECKOUT_LIMITS.siteDaily, now);
  if (!site.ok) return { ok: false, retryAfterSec: site.retryAfterSec, message: "Checkout is paused for today on this demo. Try again tomorrow." };
  return { ok: true };
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number; message: string };

/**
 * Count one AI call for `who` (a shop id or a visitor IP) on `feature`. Returns ok:false, with a
 * friendly message, once the hourly limit or the site's daily ceiling is reached.
 */
export function takeAiCall(feature: AiFeature, who: string, now = Date.now()): LimitResult {
  if (windows.size > 50_000) sweep(now);
  const mine = take(`${feature}:${who}`, AI_LIMITS[feature], now);
  if (!mine.ok) {
    const minutes = Math.max(1, Math.ceil(mine.retryAfterSec / 60));
    return { ok: false, retryAfterSec: mine.retryAfterSec, message: `You've reached the demo's fair-use limit for AI. Try again in ${minutes} min.` };
  }
  const site = take("site", AI_LIMITS.siteDaily, now);
  if (!site.ok) {
    return { ok: false, retryAfterSec: site.retryAfterSec, message: "The demo's AI is resting for today (daily limit reached). Everything else still works." };
  }
  return { ok: true };
}

function sweep(now: number) {
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

/** The caller's IP as Render's proxy reports it, for per-visitor limits on public endpoints. */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** For tests. */
export function resetLimits() {
  windows.clear();
}
