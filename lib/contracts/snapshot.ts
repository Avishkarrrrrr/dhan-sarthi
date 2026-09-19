import type { AssetClass, Customer } from "@/lib/data/types";
import { monthlySurplus, netWorth, spendingInsights } from "@/lib/finance/metrics";
import {
  ASSET_CLASSES,
  emptyWeights,
  type FinancialSnapshot,
  type InvestmentPolicyStatement,
  type PortfolioXray,
} from "./types";

/**
 * Build a `FinancialSnapshot` from a `Customer`.
 *
 * Workstream C owns the eventual full version (true look-through, step-up SIP
 * math, Black-Litterman inputs). This is the honest subset we can compute from
 * what the bank actually returns today, so the trust layer can run against real
 * IDBI customers rather than only fixtures. Anything not derivable is left
 * empty rather than invented — `bySector` in particular.
 */

/** Class weights from holdings, 0..1. Sums to 1 unless the customer is empty. */
export function allocationByClass(c: Customer): Record<AssetClass, number> {
  const weights = emptyWeights();
  const total = netWorth(c);
  if (total <= 0) return weights;
  for (const h of c.holdings) weights[h.assetClass] += h.value / total;
  for (const k of ASSET_CLASSES) weights[k] = round4(weights[k]);
  return weights;
}

/**
 * Partial X-ray. `byStock` lists **direct equity only**: a diversified fund is
 * the opposite of single-stock risk, so counting it as one line would invert
 * the meaning of the concentration rules. Looking *through* funds to their real
 * constituents is Workstream C's job; until then `bySector` stays empty rather
 * than carrying an invented split into rules that act on it.
 */
export function buildXray(c: Customer): PortfolioXray {
  const total = netWorth(c) || 1;
  const byStock = c.holdings
    .filter((h) => h.assetClass === "equity")
    .map((h) => ({ name: h.name, weight: round4(h.value / total) }))
    .sort((a, b) => b.weight - a.weight);

  const weights = allocationByClass(c);
  const concentrationFlags: string[] = [];
  for (const k of ASSET_CLASSES) {
    if (weights[k] > 0.6) {
      concentrationFlags.push(`${k} ${pct(weights[k])} of portfolio in a single asset class`);
    }
  }
  for (const s of byStock) {
    if (s.weight > 0.25) {
      concentrationFlags.push(`${s.name} ${pct(s.weight)} of portfolio in one holding`);
    }
  }
  return { byStock, bySector: [], overlapPct: 0, concentrationFlags };
}

/**
 * Derive the IPS from the customer's goals. The horizon is the nearest goal —
 * the binding constraint, since money needed in 2 years cannot sit in equity
 * however long the other goals run.
 */
export function buildIps(c: Customer, now = new Date()): InvestmentPolicyStatement {
  const year = now.getUTCFullYear();
  const horizons = c.goals.map((g) => g.targetYear - year).filter((h) => h > 0);
  return {
    monthlySip: Math.max(0, monthlySurplus(c)),
    annualStepUpPct: 10,
    horizonYears: horizons.length ? Math.min(...horizons) : 10,
    targetCorpus: c.goals.reduce((s, g) => s + g.targetAmount, 0),
    riskProfile: c.riskProfile,
    goals: c.goals,
  };
}

/** Average monthly spend (positive INR), used for emergency-fund cover. */
export function monthlyExpenses(c: Customer): number {
  return spendingInsights(c).reduce((s, x) => s + x.total, 0);
}

export function buildSnapshot(c: Customer, now = new Date()): FinancialSnapshot {
  return {
    customer: c,
    netWorth: netWorth(c),
    allocationByClass: allocationByClass(c),
    xray: buildXray(c),
    investableSurplus: Math.max(0, monthlySurplus(c)),
    ips: buildIps(c, now),
  };
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function pct(w: number): string {
  return `${Math.round(w * 100)}%`;
}
