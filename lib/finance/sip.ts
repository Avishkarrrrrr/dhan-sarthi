import type { GapAnalysis, InvestmentPolicyStatement } from "@/lib/contracts/types";

/**
 * Step-up SIP arithmetic, and the gap it exposes.
 *
 * A flat SIP understates what a salaried investor can actually do: income
 * rises, so the contribution should too. More importantly, the *gap* — what
 * the plan needs versus what the customer said they can manage — is the one
 * number that turns a recommendation into a conversation. "Your goal needs
 * ₹42,000 a month and you told me ₹25,000" is advice; a projected return is
 * a forecast.
 *
 * Everything here is deterministic, so the same plan is judged identically at
 * a demo today and at an audit in two years.
 */

/** Monthly compounding rate from an annual percentage. */
function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

export interface SipInput {
  /** What the customer contributes each month in year one. */
  monthly: number;
  /** Annual increase applied at each anniversary, as a percentage. */
  stepUpPct: number;
  years: number;
  annualReturnPct: number;
  /** Already saved toward the goal; compounds alongside the contributions. */
  existing?: number;
}

/**
 * Future value of a stepped-up SIP.
 *
 * Iterated month by month rather than solved in closed form: the step-up makes
 * the closed form fiddly enough to get quietly wrong, and 12 × 30 iterations
 * costs nothing. Contributions land at the end of each month, which is how a
 * SIP mandate actually debits.
 */
export function projectedCorpus(input: SipInput): number {
  const { monthly, stepUpPct, years, annualReturnPct, existing = 0 } = input;
  if (years <= 0) return existing;

  const r = monthlyRate(annualReturnPct);
  let corpus = existing;
  let sip = Math.max(0, monthly);

  for (let year = 0; year < years; year++) {
    for (let month = 0; month < 12; month++) {
      corpus = corpus * (1 + r) + sip;
    }
    sip *= 1 + stepUpPct / 100;
  }
  return Math.round(corpus);
}

/**
 * The monthly contribution that would actually reach the target.
 *
 * Found by bisection on the same projection, so the answer is consistent with
 * it by construction — an analytic inverse of a slightly different model is
 * how a planner ends up telling someone they are on track when they are not.
 */
export function requiredMonthlySip(
  target: number,
  input: Omit<SipInput, "monthly">,
): number {
  const needed = target - projectedCorpus({ ...input, monthly: 0 });
  if (needed <= 0) return 0; // existing savings already get there

  let lo = 0;
  let hi = Math.max(1000, target / 12); // generous ceiling, narrowed below
  while (projectedCorpus({ ...input, monthly: hi }) < target && hi < 1e9) hi *= 2;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (projectedCorpus({ ...input, monthly: mid }) < target) lo = mid;
    else hi = mid;
  }
  return Math.round(hi);
}

/** How far the stated plan falls short of the target, if at all. */
export function gapAnalysis(
  ips: InvestmentPolicyStatement,
  annualReturnPct: number,
  existing = 0,
): GapAnalysis {
  const years = Math.max(1, ips.horizonYears);
  const base = { stepUpPct: ips.annualStepUpPct, years, annualReturnPct, existing };

  const projected = projectedCorpus({ ...base, monthly: ips.monthlySip });
  const required = requiredMonthlySip(ips.targetCorpus, base);

  return {
    requiredMonthlySip: required,
    statedMonthlySip: Math.round(ips.monthlySip),
    shortfall: Math.max(0, required - Math.round(ips.monthlySip)),
    projectedCorpus: projected,
    targetCorpus: Math.round(ips.targetCorpus),
    // A plan that lands within 2% of the target is on track; demanding the
    // exact rupee would flag every realistic plan as failing.
    onTrack: projected >= ips.targetCorpus * 0.98,
  };
}
