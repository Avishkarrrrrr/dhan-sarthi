import { weightedMetrics } from "@/lib/finance/mpt";
import { gapAnalysis } from "@/lib/finance/sip";
import {
  ASSET_CLASSES,
  emptyWeights,
  type AgentView,
  type Allocation,
  type AssetClass,
  type FinancialSnapshot,
  type RiskProfile,
} from "@/lib/contracts/types";

/**
 * The strategist: turns a set of agent tilts into one allocation.
 *
 * It starts from a house model for the customer's risk profile and lets the
 * committee move it, rather than letting the agents build a portfolio from
 * nothing. That ordering matters — specialists each optimising their own
 * sleeve produce something no one would sign off, whereas a known starting
 * point that the committee nudges stays recognisable and explainable.
 *
 * Tilts are averaged by confidence, so an agent that admits it is guessing
 * moves the answer less than one reading a live feed.
 */

/** House model portfolios. Each sums to 1. */
export const BASE_MODELS: Record<RiskProfile, Record<AssetClass, number>> = {
  conservative: { equity: 0.08, mutual_fund: 0.17, bonds: 0.25, fd: 0.3, gold: 0.07, cash: 0.13 },
  moderate: { equity: 0.15, mutual_fund: 0.35, bonds: 0.18, fd: 0.15, gold: 0.07, cash: 0.1 },
  aggressive: { equity: 0.28, mutual_fund: 0.42, bonds: 0.1, fd: 0.06, gold: 0.06, cash: 0.08 },
};

/**
 * How far the committee can move the house model. Deliberately modest: a
 * tilt is a view, not a mandate to rebuild the portfolio, and the compliance
 * layer downstream is a backstop, not a licence to be reckless first.
 */
const MAX_TILT_EFFECT = 0.4;

/** Confidence-weighted mean tilt per asset class. */
export function fuseTilts(views: AgentView[]): Record<AssetClass, number> {
  const weighted = emptyWeights();
  const mass = emptyWeights();

  for (const v of views) {
    const confidence = Number.isFinite(v.confidence) ? Math.max(0, Math.min(1, v.confidence)) : 0;
    for (const c of ASSET_CLASSES) {
      const t = v.tilt[c];
      if (typeof t !== "number" || !Number.isFinite(t)) continue;
      weighted[c] += t * confidence;
      mass[c] += confidence;
    }
  }

  const out = emptyWeights();
  for (const c of ASSET_CLASSES) out[c] = mass[c] > 0 ? weighted[c] / mass[c] : 0;
  return out;
}

export function strategise(views: AgentView[], snapshot: FinancialSnapshot): Allocation {
  const base = BASE_MODELS[snapshot.ips.riskProfile];
  const tilts = fuseTilts(views);

  // Apply tilts multiplicatively so a class can be leaned on without any
  // weight ever going negative, then renormalise back to a whole portfolio.
  const raw = emptyWeights();
  for (const c of ASSET_CLASSES) {
    raw[c] = Math.max(0, base[c] * (1 + MAX_TILT_EFFECT * tilts[c]));
  }
  const total = ASSET_CLASSES.reduce((s, c) => s + raw[c], 0) || 1;

  const weights = emptyWeights();
  for (const c of ASSET_CLASSES) weights[c] = Math.round((raw[c] / total) * 1e4) / 1e4;

  // Absorb the rounding residual in cash — never in a class a tilt just moved.
  const drift = 1 - ASSET_CLASSES.reduce((s, c) => s + weights[c], 0);
  if (Math.abs(drift) > 1e-9) weights.cash = Math.round((weights.cash + drift) * 1e4) / 1e4;

  const m = weightedMetrics(weights);
  const movers = rankMovers(tilts);

  const expectedReturnPct = Math.round(m.return * 1000) / 10;

  /*
   * The gap. Computed at the expected return of *this* allocation rather than
   * a house assumption, so a more cautious plan honestly needs a larger monthly
   * contribution — which is the trade-off the customer is actually making, and
   * the one a single fixed return number would hide.
   */
  const gap = snapshot.ips.targetCorpus > 0
    ? gapAnalysis(snapshot.ips, expectedReturnPct, snapshot.netWorth)
    : undefined;

  return {
    weights,
    expectedReturnPct,
    volatilityPct: Math.round(m.volatility * 1000) / 10,
    rationale: buildRationale(snapshot.ips.riskProfile, views, movers),
    contributingViews: views.map((v) => v.agentId),
    ...(gap ? { gap } : {}),
  };
}

/** The classes the committee moved most, largest first. */
function rankMovers(tilts: Record<AssetClass, number>): AssetClass[] {
  return ASSET_CLASSES.filter((c) => Math.abs(tilts[c]) > 0.08).sort(
    (a, b) => Math.abs(tilts[b]) - Math.abs(tilts[a]),
  );
}

const LABEL: Record<AssetClass, string> = {
  equity: "direct equity",
  mutual_fund: "mutual funds",
  bonds: "bonds",
  fd: "fixed deposits",
  gold: "gold",
  cash: "cash",
};

function buildRationale(profile: RiskProfile, views: AgentView[], movers: AssetClass[]): string {
  const lead = views.slice().sort((a, b) => b.confidence - a.confidence)[0];
  const moved = movers.slice(0, 2).map((c) => LABEL[c]).join(" and ");
  const base = `Starting from the ${profile} house model`;
  if (!movers.length) {
    return `${base}, the committee saw nothing that argued for moving away from it.`;
  }
  return `${base}, the committee adjusted ${moved}. The strongest view came from the ${lead.agentId} desk: ${lead.headline.toLowerCase()}.`;
}
