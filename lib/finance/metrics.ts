import type { AssetClass, Customer } from "@/lib/data/types";
import { UNCATEGORISED, isPlaceholderCategory } from "./category";

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

/**
 * What the statement supports when it carries no merchant detail.
 *
 * The sandbox feed is uncategorised, so a category chart there is six bars
 * labelled with reference numbers. Money in, money out and the largest debits
 * are all genuinely in the data, and they are enough to talk about a customer's
 * month honestly.
 */
export interface Cashflow {
  months: number;
  monthlyIn: number;
  monthlyOut: number;
  debitCount: number;
  creditCount: number;
  /** Biggest debits in the window, largest first. */
  largest: { date: string; amount: number; category: string }[];
  /** False when every debit is uncategorised — the chart is then misleading. */
  categorised: boolean;
}

export function cashflow(c: Customer): Cashflow {
  const txns = c.transactions ?? [];
  const months = new Set(txns.map((t) => t.date.slice(0, 7))).size || 1;
  const debits = txns.filter((t) => t.amount < 0);
  const credits = txns.filter((t) => t.amount > 0);
  return {
    months,
    monthlyIn: Math.round(credits.reduce((s, t) => s + t.amount, 0) / months),
    monthlyOut: Math.round(debits.reduce((s, t) => s + Math.abs(t.amount), 0) / months),
    debitCount: debits.length,
    creditCount: credits.length,
    largest: debits
      .map((t) => ({ date: t.date, amount: Math.abs(t.amount), category: t.category }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    categorised: debits.some((t) => !isPlaceholderCategory(t.category)),
  };
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

/**
 * Rough monthly-savings estimate: average monthly (credits − debits).
 *
 * Falls back to income minus spend when the statement window contains no
 * credits at all. A core-banking statement pulled for a single month often
 * catches the debits but not the salary that funded them, and netting those
 * alone reports the customer as losing their whole income every month — which
 * is not a surplus estimate, it is an artefact of the window.
 */
export function monthlySurplus(c: Customer): number {
  const months = new Set(c.transactions.map((t) => t.date.slice(0, 7))).size || 1;
  const credits = c.transactions.filter((t) => t.amount > 0);
  if (credits.length === 0) {
    const spend = spendingInsights(c).reduce((s, x) => s + x.total, 0);
    return Math.round(c.monthlyIncome - spend);
  }
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

  /*
   * Top spending category — only when there is one. The live statement feed is
   * uncategorised, and a nudge reading "Top spend: S1 TXN 19" is worse than no
   * nudge: it advises the customer to trim a reference number.
   */
  const spends = spendingInsights(c);
  const flow = cashflow(c);
  const top = spends[0];
  if (top && top.category !== UNCATEGORISED) {
    nudges.push({
      id: "top-spend",
      severity: "info",
      title: `Top spend: ${top.category}`,
      detail: `You spend about ₹${top.total.toLocaleString("en-IN")}/month here. Trimming 15% could add ₹${Math.round(top.total * 0.15 * 12).toLocaleString("en-IN")}/year to your investments.`,
    });
  } else if (flow.monthlyOut > 0) {
    nudges.push({
      id: "cashflow",
      severity: "info",
      title: `About ₹${flow.monthlyOut.toLocaleString("en-IN")} leaves your account each month`,
      detail: `Across ${flow.debitCount} debits. Your bank statement does not carry merchant detail, so I cannot break that into categories — but trimming 10% of it would free ₹${Math.round(flow.monthlyOut * 0.1 * 12).toLocaleString("en-IN")} a year to invest.`,
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
