import type { AssetClass, Customer } from "@/lib/data/types";
import { monthlySurplus, netWorth, spendingInsights } from "@/lib/finance/metrics";
import { lookThrough } from "@/lib/finance/xray";
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
 * Everything here is computed from what the bank actually returns, so the
 * trust layer runs against real IDBI customers rather than only fixtures.
 * Anything not derivable is left empty or counted as unclassified rather than
 * invented.
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
 * The X-ray: what the customer actually owns, through every wrapper.
 *
 * The unwrapping itself lives in `lib/finance/xray.ts`, including the honest
 * accounting for anything it could not model. What is assembled here is the
 * contract shape the committee and the rules read — plus the class-level
 * flags, which remain the only concentration signal available for a customer
 * whose whole position is a fixed deposit and who therefore has no equity to
 * look through.
 */
export function buildXray(c: Customer): PortfolioXray {
  const lt = lookThrough(c);
  const weights = allocationByClass(c);

  const concentrationFlags: string[] = [];
  for (const k of ASSET_CLASSES) {
    if (weights[k] > 0.6) {
      concentrationFlags.push(`${k} ${pct(weights[k])} of portfolio in a single asset class`);
    }
  }
  for (const s of lt.byStock) {
    if (s.weight > 0.25) {
      concentrationFlags.push(`${s.name} ${pct(s.weight)} of portfolio in one company`);
    }
  }
  if (lt.overlapPct > 0.25) {
    concentrationFlags.push(
      `${pct(lt.overlapPct)} of the equity money buys companies already held through another fund`,
    );
  }

  return {
    byStock: lt.byStock,
    bySector: lt.bySector,
    overlapPct: lt.overlapPct,
    concentrationFlags,
    effectiveEquityPct: lt.effectiveEquityPct,
    headlineEquityPct: lt.headlineEquityPct,
    unclassifiedPct: lt.unclassifiedPct,
    stockCoverage: lt.stockCoverage,
    vehicles: lt.vehicles.map(({ name, value, category, equityValue, classified }) => ({
      name,
      value,
      category,
      equityValue,
      classified,
    })),
    asOf: lt.asOf,
    source: lt.source,
  };
}

/**
 * Derive the IPS from the customer's goals. The horizon is the nearest goal —
 * the binding constraint, since money needed in 2 years cannot sit in equity
 * however long the other goals run.
 */
export function buildIps(c: Customer, now = new Date()): InvestmentPolicyStatement {
  const year = now.getUTCFullYear();
  const horizons = c.goals.map((g) => g.targetYear - year).filter((h) => h > 0);
  const horizonYears = horizons.length ? Math.min(...horizons) : 10;

  /*
   * The target has to belong to the same horizon as the deadline.
   *
   * Summing every goal — retirement included — against the *nearest* goal's
   * horizon asks a customer to save a retirement corpus in four years. For
   * Priya that produced a required contribution of ₹3.48 lakh a month against
   * an income of ₹1.2 lakh: arithmetically correct, and advice no adviser
   * would ever give. The binding goal is the near one, so that is what the
   * plan is measured against; the longer goals stay in `goals` and come back
   * into view as their own horizon approaches.
   */
  const binding = c.goals.filter((g) => g.targetYear - year > 0 && g.targetYear - year <= horizonYears);
  const inScope = binding.length ? binding : c.goals;

  return {
    monthlySip: Math.max(0, monthlySurplus(c)),
    annualStepUpPct: 10,
    horizonYears,
    targetCorpus: inScope.reduce((s, g) => s + g.targetAmount, 0),
    riskProfile: c.riskProfile,
    goals: c.goals,
  };
}

/** Already saved toward the goals the plan is measured against. */
export function committedSavings(c: Customer, now = new Date()): number {
  const year = now.getUTCFullYear();
  const ips = buildIps(c, now);
  return c.goals
    .filter((g) => g.targetYear - year > 0 && g.targetYear - year <= ips.horizonYears)
    .reduce((s, g) => s + g.current, 0);
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
