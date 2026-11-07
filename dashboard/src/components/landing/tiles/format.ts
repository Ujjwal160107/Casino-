/** Number and time formatting for the tiles. Pure functions: safe to call during render. */

/** Whole numbers the way the bot prints them: 55,000. */
export const formatInt = (n: number) => Math.round(n).toLocaleString("en-US");

/** A stock price: whole numbers from 1,000 up, two decimals below, up to four under 1. */
export function formatPrice(n: number) {
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions =
    abs >= 1000 ? { maximumFractionDigits: 0 } : abs >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  return n.toLocaleString("en-US", opts);
}

/** Change since the previous tick, rounded to one decimal; null when there is no previous price. */
export function priceChange(price: number, previous: number) {
  if (!(previous > 0)) return null;
  const pct = Math.round(((price - previous) / previous) * 1000) / 10;
  const up = pct >= 0;
  return { up, text: `${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%` };
}

/** "Updated 4 min ago" from an ISO time and the current clock (null when either is unknown). */
export function updatedAgo(iso: string, now: number) {
  const t = Date.parse(iso);
  if (!now || Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  return `Updated ${Math.floor(hours / 24)} d ago`;
}

/** A chart's time span: "Last 30 minutes", "Last hour", "Last 24 hours", "Last 3 days". */
export function formatSpan(ms: number) {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `Last ${mins} minutes`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "Last hour";
  if (hours < 48) return `Last ${hours} hours`;
  return `Last ${Math.round(hours / 24)} days`;
}
