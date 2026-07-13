/** INR formatting with lakh/crore where natural. */
export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Compact INR: ₹1.4L, ₹4.55Cr, ₹32k. */
export function inrCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + "Cr";
  if (abs >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + "L";
  if (abs >= 1e3) return "₹" + (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return "₹" + Math.round(n).toString();
}

export const ASSET_LABELS: Record<string, string> = {
  equity: "Equity",
  mutual_fund: "Mutual Funds",
  fd: "Fixed Deposits",
  gold: "Gold",
  cash: "Cash & Liquid",
};

/** Chart palette derived from the brand green. */
export const CHART_COLORS = ["#0B7A4B", "#12B886", "#38D9A9", "#0CA678", "#087F5B", "#66D9AE"];
