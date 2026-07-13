import type { AssetClass, Customer } from "@/lib/data/types";

export interface AllocationSlice {
  assetClass: AssetClass;
  value: number;
  pct: number;
}

export interface SpendingSlice {
  category: string;
  total: number;
}

export interface Nudge {
  id: string;
  severity: "info" | "warn" | "good";
  title: string;
  detail: string;
}

export function netWorth(c: Customer): number {
  return c.holdings.reduce((s, h) => s + h.value, 0);
}

export function allocation(c: Customer): AllocationSlice[] {
  const total = netWorth(c) || 1;
  const byClass = new Map<AssetClass, number>();
  for (const h of c.holdings) {
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.value);
  }
  return [...byClass.entries()]
    .map(([assetClass, value]) => ({ assetClass, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

/** Monthly-averaged spend per category (positive numbers), sorted desc. */
export function spendingInsights(c: Customer): SpendingSlice[] {
  const months = new Set(c.transactions.map((t) => t.date.slice(0, 7))).size || 1;
  const byCat = new Map<string, number>();
  for (const t of c.transactions) {
    if (t.amount < 0) {
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + Math.abs(t.amount));
    }
  }
  return [...byCat.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total / months) }))
    .sort((a, b) => b.total - a.total);
}

export function equityExposurePct(c: Customer): number {
  const alloc = allocation(c);
  const equity = alloc
    .filter((a) => a.assetClass === "equity" || a.assetClass === "mutual_fund")
    .reduce((s, a) => s + a.pct, 0);
  return equity;
}

/** Rough monthly-savings estimate: average monthly (credits - debits). */
export function monthlySurplus(c: Customer): number {
  const months = new Set(c.transactions.map((t) => t.date.slice(0, 7))).size || 1;
  const net = c.transactions.reduce((s, t) => s + t.amount, 0);
  return Math.round(net / months);
}

/**
 * Proactive nudges derived from the 360° data — the "always-on advisor" layer.
 * Rules are simple and explainable on purpose.
 */
export function computeNudges(c: Customer): Nudge[] {
  const nudges: Nudge[] = [];
  const equity = equityExposurePct(c);

  // Equity drift vs. a rough age/risk band.
  const targetEquity =
    c.riskProfile === "aggressive" ? 70 : c.riskProfile === "moderate" ? 55 : 35;
  if (equity - targetEquity > 12) {
    nudges.push({
      id: "equity-drift",
      severity: "warn",
      title: "Equity allocation looks high",
      detail: `You're ~${Math.round(equity)}% in equity vs ~${targetEquity}% typical for a ${c.riskProfile} profile. Consider rebalancing to lock in gains.`,
    });
  } else if (targetEquity - equity > 15) {
    nudges.push({
      id: "equity-low",
      severity: "info",
      title: "Room to grow with equity",
      detail: `You're ~${Math.round(equity)}% in equity vs ~${targetEquity}% typical for a ${c.riskProfile} profile. A higher equity share could improve long-term returns.`,
    });
  }

  // Top spending category.
  const spends = spendingInsights(c);
  if (spends.length) {
    const top = spends[0];
    nudges.push({
      id: "top-spend",
      severity: "info",
      title: `Top spend: ${top.category}`,
      detail: `You spend about ₹${top.total.toLocaleString("en-IN")}/month here. Trimming 15% could add ₹${Math.round(top.total * 0.15 * 12).toLocaleString("en-IN")}/year to your investments.`,
    });
  }

  // Emergency fund: cash+FD vs ~6 months of spend.
  const liquid = c.holdings
    .filter((h) => h.assetClass === "cash" || h.assetClass === "fd")
    .reduce((s, h) => s + h.value, 0);
  const monthlySpend = spends.reduce((s, x) => s + x.total, 0);
  if (monthlySpend > 0) {
    const monthsCovered = liquid / monthlySpend;
    if (monthsCovered < 6) {
      nudges.push({
        id: "emergency-fund",
        severity: "warn",
        title: "Emergency fund is light",
        detail: `Your liquid savings cover ~${monthsCovered.toFixed(1)} months of expenses. Aim for 6 months before adding risk assets.`,
      });
    } else {
      nudges.push({
        id: "emergency-fund-ok",
        severity: "good",
        title: "Emergency fund looks healthy",
        detail: `Your liquid savings cover ~${monthsCovered.toFixed(1)} months of expenses. Nicely cushioned.`,
      });
    }
  }

  return nudges;
}
