/** Shared utility: get today's date as YYYY-MM-DD in UTC */
export function getUTCToday(): string {
  return new Date().toISOString().split("T")[0];
}

/** Get yesterday's date as YYYY-MM-DD in UTC */
export function getUTCYesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

/** Get next midnight UTC as ISO string */
export function getNextMidnightUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Format a price number nicely: $67,542.30 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Calculate win rate percentage */
export function calcWinRate(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}
