import type { AssetClass } from "@/lib/data/types";
import { monthlyExpenses } from "@/lib/contracts/snapshot";
import { weightedMetrics } from "@/lib/finance/mpt";
import {
  ASSET_CLASSES,
  DEFENSIVE_CLASSES,
  GROWTH_CLASSES,
  LIQUID_CLASSES,
  emptyWeights,
  sumOf,
  type Allocation,
  type FinancialSnapshot,
} from "@/lib/contracts/types";
import {
  DEFENSIVE_SINK,
  EMERGENCY_MONTHS,
  MAX_GOLD,
  MAX_SINGLE_CLASS,
  RISK_BANDS,
  SENIOR_AGE,
  SENIOR_MAX_GROWTH,
  SHORT_HORIZON_MAX_GROWTH,
  SHORT_HORIZON_YEARS,
} from "./policy";
import { checkAll } from "./rules";

/**
 * Turn a non-compliant allocation into the nearest compliant one.
 *
 * "Nearest" is deliberate: we cut what breaches a cap and park the freed weight
 * in defensive assets, rather than replacing the proposal with a house model
 * portfolio. The customer should still recognise their own plan in the answer —
 * a block is far easier to accept when it comes with the adjusted version
 * beside it.
 *
 * Returns `undefined` when no reweighting clears the high-severity rules, which
 * is the honest outcome for a proposal that is wrong in kind rather than degree.
 */

type Weights = Record<AssetClass, number>;

export function rewriteAllocation(
  proposed: Allocation,
  snapshot: FinancialSnapshot,
): Allocation | undefined {
  const band = RISK_BANDS[snapshot.ips.riskProfile];
  let w = sanitise(proposed.weights);
  if (total(w) <= 0) return undefined;
  w = normalise(w);

  // The binding growth ceiling is the strictest of the three that can apply.
  let growthCap = band.maxGrowth;
  if (snapshot.ips.horizonYears < SHORT_HORIZON_YEARS) {
    growthCap = Math.min(growthCap, SHORT_HORIZON_MAX_GROWTH);
  }
  if (snapshot.customer.age >= SENIOR_AGE) {
    growthCap = Math.min(growthCap, SENIOR_MAX_GROWTH);
  }

  w = capGroup(w, GROWTH_CLASSES, growthCap);
  w = capClass(w, "gold", MAX_GOLD);
  w = capDirectEquity(w, band.maxDirectEquity, growthCap);
  for (const c of ASSET_CLASSES) w = capClass(w, c, MAX_SINGLE_CLASS);
  w = raiseFloor(w, DEFENSIVE_CLASSES, band.minDefensive);
  w = raiseFloor(w, LIQUID_CLASSES, liquidityFloor(snapshot));
  w = round(normalise(w));

  const rewritten = withMetrics(w, proposed, snapshot);
  // Only offer it if it actually clears the red lines. A "safe" alternative
  // that still breaches one would be worse than offering nothing.
  if (checkAll(rewritten, snapshot).some((v) => v.severity === "high")) return undefined;
  return rewritten;
}

/**
 * The liquid weight needed to keep a 6-month buffer, as a fraction of net
 * worth. Returns 0 when the buffer is out of reach at any allocation — forcing
 * everything liquid would not achieve it and would wreck diversification
 * trying; see the matching carve-out in the emergency-fund rule.
 */
function liquidityFloor(s: FinancialSnapshot): number {
  const monthly = monthlyExpenses(s.customer);
  if (monthly <= 0 || s.netWorth <= 0) return 0;
  const needed = (monthly * EMERGENCY_MONTHS) / s.netWorth;
  return needed > 1 ? 0 : needed;
}

/** Drop NaNs and negatives — a rewrite starts from something well-formed. */
function sanitise(weights: Weights): Weights {
  const out = emptyWeights();
  for (const c of ASSET_CLASSES) {
    const v = weights[c];
    out[c] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  return out;
}

function total(w: Weights): number {
  return ASSET_CLASSES.reduce((s, c) => s + w[c], 0);
}

function normalise(w: Weights): Weights {
  const t = total(w);
  if (t <= 0) return w;
  const out = emptyWeights();
  for (const c of ASSET_CLASSES) out[c] = w[c] / t;
  return out;
}

/** Scale a group down to its cap, parking the excess in defensive assets. */
function capGroup(w: Weights, classes: readonly AssetClass[], cap: number): Weights {
  const current = sumOf(w, classes);
  if (current <= cap || current <= 0) return w;
  const out = { ...w };
  const scale = cap / current;
  for (const c of classes) out[c] = w[c] * scale;
  return park(out, current - cap, classes);
}

function capClass(w: Weights, c: AssetClass, cap: number): Weights {
  if (w[c] <= cap) return w;
  const out = { ...w };
  const excess = w[c] - cap;
  out[c] = cap;
  return park(out, excess, [c]);
}

/**
 * Direct single-stock exposure moves into funds where there is room under the
 * growth ceiling — same asset class, diversified — and into defensive assets
 * otherwise.
 */
function capDirectEquity(w: Weights, cap: number, growthCap: number): Weights {
  if (w.equity <= cap) return w;
  const out = { ...w };
  const excess = w.equity - cap;
  out.equity = cap;
  const headroom = Math.max(0, growthCap - sumOf(out, GROWTH_CLASSES));
  const toFunds = Math.min(excess, headroom);
  out.mutual_fund += toFunds;
  return toFunds < excess ? park(out, excess - toFunds, GROWTH_CLASSES) : out;
}

/** Top a group up to its floor, taking pro-rata from everything outside it. */
function raiseFloor(w: Weights, classes: readonly AssetClass[], floor: number): Weights {
  const current = sumOf(w, classes);
  if (floor <= 0 || current >= floor) return w;
  const need = floor - current;
  const donors = ASSET_CLASSES.filter((c) => !classes.includes(c));
  const pool = sumOf(w, donors);
  if (pool <= 0) return w;
  const take = Math.min(need, pool);
  const out = { ...w };
  for (const c of donors) out[c] = w[c] * (1 - take / pool);
  // Prefer the safest members of the group first: bonds, then FD, then cash.
  const ordered = DEFENSIVE_SINK.filter((c) => classes.includes(c));
  const targets = ordered.length ? ordered : classes;
  return add(out, take, targets);
}

/** Move freed weight into defensive assets, skipping the classes we just cut. */
function park(w: Weights, amount: number, exclude: readonly AssetClass[]): Weights {
  const targets = DEFENSIVE_SINK.filter((c) => !exclude.includes(c));
  return add(w, amount, targets.length ? targets : DEFENSIVE_SINK);
}

/**
 * Distribute `amount` across targets, pro-rata but never past the
 * single-class cap.
 *
 * A plain pro-rata split re-breaches the caps that ran earlier: raising the
 * liquidity floor for a customer whose net worth is under six months of
 * expenses pushes nearly everything into whichever liquid class was already
 * largest, and that class then exceeds the concentration limit. Filling the
 * class with the most headroom first keeps the result inside both rules, which
 * is what makes a compliant alternative offerable at all.
 */
function add(w: Weights, amount: number, targets: readonly AssetClass[]): Weights {
  if (amount <= 0 || !targets.length) return w;
  const out = { ...w };
  let left = amount;

  // Pro-rata first, clipped at the cap.
  const base = sumOf(w, targets);
  for (const c of targets) {
    const share = base > 0 ? amount * (w[c] / base) : amount / targets.length;
    const room = Math.max(0, MAX_SINGLE_CLASS - out[c]);
    const give = Math.min(share, room, left);
    out[c] += give;
    left -= give;
  }

  // Whatever the caps refused, pour into remaining headroom, largest first.
  while (left > 1e-9) {
    const open = targets
      .filter((c) => out[c] < MAX_SINGLE_CLASS - 1e-9)
      .sort((a, b) => MAX_SINGLE_CLASS - out[b] - (MAX_SINGLE_CLASS - out[a]));
    if (!open.length) break; // Genuinely cannot place it; the caller re-checks.
    const c = open[0];
    const give = Math.min(left, MAX_SINGLE_CLASS - out[c]);
    out[c] += give;
    left -= give;
  }

  return out;
}

/**
 * Round to whole basis points, absorbing the residual in cash.
 *
 * Cash deliberately, not the largest class: the largest class is usually the
 * one a cap just cut, and pushing the rounding error back into it could lift it
 * over that cap again. Rounding error should always land somewhere safe.
 */
function round(w: Weights): Weights {
  const out = emptyWeights();
  for (const c of ASSET_CLASSES) out[c] = Math.round(w[c] * 1e4) / 1e4;
  const drift = 1 - total(out);
  if (Math.abs(drift) > 1e-9) out.cash = Math.round((out.cash + drift) * 1e4) / 1e4;
  return out;
}

function withMetrics(
  w: Weights,
  proposed: Allocation,
  snapshot: FinancialSnapshot,
): Allocation {
  const m = weightedMetrics(w);
  return {
    weights: w,
    expectedReturnPct: Math.round(m.return * 1000) / 10,
    volatilityPct: Math.round(m.volatility * 1000) / 10,
    rationale: `Adjusted to stay within the suitability limits for a ${snapshot.ips.riskProfile} investor: growth assets capped, defensive holdings and the emergency buffer restored. Original rationale: ${proposed.rationale}`,
    contributingViews: proposed.contributingViews,
  };
}
