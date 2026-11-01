const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * When the seller must respond to a dispute. Real disputes: exactly PayPal's deadline.
 * Seeded demo disputes have no PayPal record, so once their deadline passes it rolls forward
 * a week at a time; the demo shop always shows live countdowns instead of stale "overdue" rows.
 */
export function disputeDueAt(responseDueAt: Date | null, demo: boolean, now = Date.now()): Date | null {
  if (!responseDueAt || !demo || responseDueAt.getTime() > now) return responseDueAt;
  const weeks = Math.ceil((now - responseDueAt.getTime()) / WEEK);
  return new Date(responseDueAt.getTime() + weeks * WEEK);
}
