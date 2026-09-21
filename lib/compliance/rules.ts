import type { AssetClass } from "@/lib/data/types";
import { monthlyExpenses } from "@/lib/contracts/snapshot";
import {
  ASSET_CLASSES,
  DEFENSIVE_CLASSES,
  GROWTH_CLASSES,
  LIQUID_CLASSES,
  sumOf,
  type Allocation,
  type FinancialSnapshot,
  type Severity,
  type Violation,
} from "@/lib/contracts/types";
import {
  EMERGENCY_MONTHS,
  MAX_CREDIBLE_RETURN_PCT,
  MAX_GOLD,
  MAX_OVERLAP,
  MAX_SECTOR,
  MAX_SINGLE_CLASS,
  MAX_SINGLE_STOCK,
  RISK_BANDS,
  RISK_UNDERSTATED_VOL_PCT,
  SENIOR_AGE,
  SENIOR_MAX_GROWTH,
  SEVERE_BREACH_MARGIN,
  SEVERE_SECTOR,
  SEVERE_SINGLE_CLASS,
  SHORT_HORIZON_MAX_GROWTH,
  SHORT_HORIZON_YEARS,
  WEIGHT_SUM_TOLERANCE,
} from "./policy";

/**
 * The deterministic rules engine. Every function here is pure: same allocation
 * and snapshot in, same violations out, no I/O and no model in the loop. That
 * is the point — a compliance decision a bank can reproduce and defend is worth
 * more than a cleverer one it cannot.
 *
 * Each rule returns a stable dotted id so the UI, the tests and the audit trail
 * can all refer to the same thing.
 */

type Rule = (a: Allocation, s: FinancialSnapshot) => Violation[];

const pct = (w: number) => `${Math.round(w * 1000) / 10}%`;

/** A breach well past the cap is a block; a breach just over it is a nudge. */
function breachSeverity(actual: number, cap: number, margin = SEVERE_BREACH_MARGIN): Severity {
  return actual - cap > margin ? "high" : "med";
}

// ---------- Stage 1 rules: structural integrity ----------

const weightsSum: Rule = (a) => {
  const total = ASSET_CLASSES.reduce((s, c) => s + (a.weights[c] || 0), 0);
  if (Math.abs(total - 1) <= WEIGHT_SUM_TOLERANCE) return [];
  return [
    {
      rule: "schema.weights_sum",
      detail: `Weights sum to ${pct(total)}, not 100%. The proposal does not describe a whole portfolio.`,
      severity: "high",
    },
  ];
};

const nonNegativeWeights: Rule = (a) => {
  const negative = ASSET_CLASSES.filter((c) => (a.weights[c] || 0) < 0);
  if (!negative.length) return [];
  return [
    {
      rule: "schema.negative_weight",
      detail: `Negative weight in ${negative.join(", ")}. Short or leveraged positions are outside a retail advisory mandate.`,
      severity: "high",
    },
  ];
};

const finiteNumbers: Rule = (a) => {
  const bad = ASSET_CLASSES.filter((c) => !Number.isFinite(a.weights[c]));
  const out: Violation[] = [];
  if (bad.length) {
    out.push({
      rule: "schema.invalid_weight",
      detail: `Non-numeric weight in ${bad.join(", ")}.`,
      severity: "high",
    });
  }
  if (!Number.isFinite(a.expectedReturnPct) || !Number.isFinite(a.volatilityPct)) {
    out.push({
      rule: "schema.invalid_metrics",
      detail: "Expected return or volatility is not a number.",
      severity: "high",
    });
  }
  return out;
};

// ---------- Stage 2 rules: suitability ----------

const growthCap: Rule = (a, s) => {
  const band = RISK_BANDS[s.ips.riskProfile];
  const growth = sumOf(a.weights, GROWTH_CLASSES);
  if (growth <= band.maxGrowth) return [];
  return [
    {
      rule: "suitability.growth_cap",
      detail: `${pct(growth)} in equity and mutual funds against a ${pct(band.maxGrowth)} ceiling for a ${s.ips.riskProfile} profile.`,
      severity: breachSeverity(growth, band.maxGrowth),
    },
  ];
};

const directEquityCap: Rule = (a, s) => {
  const band = RISK_BANDS[s.ips.riskProfile];
  const equity = a.weights.equity || 0;
  if (equity <= band.maxDirectEquity) return [];
  return [
    {
      rule: "suitability.direct_equity_cap",
      detail: `${pct(equity)} in direct stocks against a ${pct(band.maxDirectEquity)} ceiling for a ${s.ips.riskProfile} profile. Single-stock risk is not diversified away.`,
      severity: breachSeverity(equity, band.maxDirectEquity),
    },
  ];
};

const defensiveFloor: Rule = (a, s) => {
  const band = RISK_BANDS[s.ips.riskProfile];
  const defensive = sumOf(a.weights, DEFENSIVE_CLASSES);
  if (defensive >= band.minDefensive) return [];
  return [
    {
      rule: "suitability.defensive_floor",
      detail: `Only ${pct(defensive)} in bonds, FD and cash against a ${pct(band.minDefensive)} floor for a ${s.ips.riskProfile} profile.`,
      severity: breachSeverity(band.minDefensive, defensive),
    },
  ];
};

const shortHorizon: Rule = (a, s) => {
  const growth = sumOf(a.weights, GROWTH_CLASSES);
  const years = s.ips.horizonYears;
  if (years >= SHORT_HORIZON_YEARS || growth <= SHORT_HORIZON_MAX_GROWTH) return [];
  return [
    {
      rule: "suitability.horizon",
      detail: `${pct(growth)} in growth assets with the nearest goal ${years} year${years === 1 ? "" : "s"} away. A drawdown has no time to recover before the money is needed.`,
      severity: "high",
    },
  ];
};

const seniorCapitalPreservation: Rule = (a, s) => {
  const growth = sumOf(a.weights, GROWTH_CLASSES);
  if (s.customer.age < SENIOR_AGE || growth <= SENIOR_MAX_GROWTH) return [];
  return [
    {
      rule: "suitability.age",
      detail: `${pct(growth)} in growth assets at age ${s.customer.age}, against a ${pct(SENIOR_MAX_GROWTH)} ceiling once regular income stops.`,
      severity: "high",
    },
  ];
};

// ---------- Stage 2 rules: concentration ----------

const singleClassCap: Rule = (a) => {
  const out: Violation[] = [];
  for (const c of ASSET_CLASSES) {
    const w = a.weights[c] || 0;
    if (w > MAX_SINGLE_CLASS) {
      out.push({
        rule: "concentration.single_class",
        detail: `${pct(w)} in ${c} alone, against a ${pct(MAX_SINGLE_CLASS)} diversification cap.`,
        severity: w > SEVERE_SINGLE_CLASS ? "high" : "med",
      });
    }
  }
  return out;
};

const goldCap: Rule = (a) => {
  const gold = a.weights.gold || 0;
  if (gold <= MAX_GOLD) return [];
  return [
    {
      rule: "concentration.gold",
      detail: `${pct(gold)} in gold against a ${pct(MAX_GOLD)} cap. Gold is a hedge, not a core holding.`,
      severity: breachSeverity(gold, MAX_GOLD),
    },
  ];
};

/**
 * Sector concentration, from the X-ray look-through.
 *
 * Judged against equity exposure, because that is the money actually exposed
 * to the sector — against net worth, a portfolio could be entirely in one
 * sector and still look tame beside a large fixed deposit.
 *
 * **Never `high`.** The concentration is in the book the customer already
 * holds, and a class-level allocation cannot unpick which companies sit inside
 * their funds; blocking on it would refuse every proposal for that customer,
 * including perfectly suitable ones, with no way out — the same trap the
 * emergency-fund rule had to be rescued from. It rises to `med`, which offers
 * a rewrite, only when reducing the growth sleeve would genuinely reduce the
 * exposure: either the proposal adds to that sleeve, or the concentration is
 * severe enough that trimming it is worth doing on its own.
 *
 * When there is no equity to look through — a customer holding only a term
 * deposit — the class-level flags are all the signal there is, so they are
 * reported rather than passing a portfolio nobody has examined.
 */
const sectorCap: Rule = (a, s) => {
  const out: Violation[] = [];
  const proposedGrowth = sumOf(a.weights, GROWTH_CLASSES);
  const currentGrowth = sumOf(s.allocationByClass, GROWTH_CLASSES);
  const addsToSleeve = proposedGrowth > currentGrowth + 0.02;

  for (const sector of s.xray.bySector) {
    if (sector.weight > MAX_SECTOR) {
      const severe = sector.weight > SEVERE_SECTOR;
      out.push({
        rule: "concentration.sector",
        detail:
          `${sector.sector} is ${pct(sector.weight)} of your equity, against a ${pct(MAX_SECTOR)} limit` +
          (addsToSleeve ? ", and this plan puts more money into that sleeve." : "."),
        severity: severe || addsToSleeve ? "med" : "low",
      });
    }
  }

  /*
   * Say how much of the equity the look-through could not model. The sector
   * figures above are shares of *all* equity, so unmodelled holdings pull them
   * down — the numbers understate concentration exactly when we know least,
   * and a reader deserves to be told that rather than left to assume coverage.
   */
  const blind = s.xray.unclassifiedPct ?? 0;
  if (blind > 0.3 && s.xray.bySector.length) {
    out.push({
      rule: "concentration.look_through_gap",
      detail: `${pct(blind)} of the equity could not be looked through, so these sector figures are a floor, not a ceiling.`,
      severity: "low",
    });
  }

  if (!s.xray.bySector.length) {
    for (const flag of s.xray.concentrationFlags) {
      out.push({ rule: "concentration.flagged", detail: flag, severity: "low" });
    }
  }
  return out;
};

/**
 * Overlap. Two funds that each put 7% into the same bank are not diversifying
 * each other, and a customer who bought the second one to spread risk has not.
 * Advisory: it describes holdings, and the remedy is switching a fund, not
 * moving money between asset classes.
 */
const fundOverlap: Rule = (_a, s) => {
  if (s.xray.overlapPct <= MAX_OVERLAP) return [];
  return [
    {
      rule: "concentration.overlap",
      detail: `${pct(s.xray.overlapPct)} of your equity buys companies you already own through another fund — that money is not diversifying you.`,
      severity: "low" as const,
    },
  ];
};

/**
 * Single-stock concentration in the book as it stands. Advisory for the same
 * reason as the flags above: worth saying, but not something a class-level
 * allocation can remedy.
 */
const singleStockCap: Rule = (_a, s) => {
  return s.xray.byStock
    .filter((h) => h.weight > MAX_SINGLE_STOCK)
    .map((h) => ({
      rule: "concentration.single_stock",
      detail: `${h.name} is ${pct(h.weight)} of the portfolio, against a ${pct(MAX_SINGLE_STOCK)} single-holding cap.`,
      severity: "low" as const,
    }));
};

/**
 * Emergency fund. Measured on the proposed allocation applied to today's net
 * worth, because a plan that funds itself by spending the buffer is unsuitable
 * however good the arithmetic looks.
 *
 * With one important exception: when the customer's entire net worth is less
 * than the buffer, no allocation can satisfy this. Treating that as a defect
 * blocks every proposal for them — including perfectly suitable ones — and
 * offers no way out, because reallocation cannot create savings that do not
 * exist. In that case it is recorded as advice to build the buffer, not as a
 * reason to refuse the plan.
 */
const emergencyFund: Rule = (a, s) => {
  const monthly = monthlyExpenses(s.customer);
  if (monthly <= 0 || s.netWorth <= 0) return [];

  const achievableMonths = s.netWorth / monthly;
  if (achievableMonths < EMERGENCY_MONTHS) {
    return [
      {
        rule: "liquidity.buffer_below_target",
        detail: `Total savings cover ${achievableMonths.toFixed(1)} months of expenses, short of the ${EMERGENCY_MONTHS}-month buffer. Building it up matters more than the mix right now.`,
        severity: "low",
      },
    ];
  }

  /*
   * Measured net of anything the bank has under lien (API 362). A buffer that
   * counts locked money is short by exactly that much, and a liquidity rule
   * whose number is not real is not a liquidity rule.
   */
  const locked = s.lienMarked ?? 0;
  const liquid = Math.max(0, sumOf(a.weights, LIQUID_CLASSES) * s.netWorth - locked);
  const months = liquid / monthly;
  if (months >= EMERGENCY_MONTHS) return [];
  return [
    {
      rule: "liquidity.emergency_fund",
      detail:
        `Leaves ${months.toFixed(1)} months of expenses liquid, against a ${EMERGENCY_MONTHS}-month buffer` +
        (locked > 0 ? `, after setting aside ₹${locked.toLocaleString("en-IN")} the bank has under lien.` : "."),
      severity: months < EMERGENCY_MONTHS / 2 ? "high" : "med",
    },
  ];
};

// ---------- Stage 2 rules: SEBI red lines ----------

const credibleReturn: Rule = (a) => {
  if (a.expectedReturnPct <= MAX_CREDIBLE_RETURN_PCT) return [];
  return [
    {
      rule: "sebi.unrealistic_return",
      detail: `Projects ${a.expectedReturnPct}% a year. Returns above ${MAX_CREDIBLE_RETURN_PCT}% cannot be presented to a retail investor as achievable.`,
      severity: "high",
    },
  ];
};

const riskNotUnderstated: Rule = (a) => {
  const growth = sumOf(a.weights, GROWTH_CLASSES);
  if (growth <= 0.5 || a.volatilityPct >= RISK_UNDERSTATED_VOL_PCT) return [];
  return [
    {
      rule: "sebi.risk_understated",
      detail: `${pct(growth)} in growth assets described with ${a.volatilityPct}% volatility. The stated risk does not match the portfolio.`,
      severity: "med",
    },
  ];
};

/** Structural checks — run first; nothing downstream is meaningful if these fail. */
export const STRUCTURAL_RULES: Rule[] = [finiteNumbers, weightsSum, nonNegativeWeights];

/** Suitability, concentration and regulatory rules. */
export const POLICY_RULES: Rule[] = [
  growthCap,
  directEquityCap,
  defensiveFloor,
  shortHorizon,
  seniorCapitalPreservation,
  singleClassCap,
  goldCap,
  sectorCap,
  fundOverlap,
  singleStockCap,
  emergencyFund,
  credibleReturn,
  riskNotUnderstated,
];

function run(rules: Rule[], a: Allocation, s: FinancialSnapshot): Violation[] {
  return rules.flatMap((r) => r(a, s));
}

export function checkStructure(a: Allocation, s: FinancialSnapshot): Violation[] {
  return run(STRUCTURAL_RULES, a, s);
}

export function checkPolicy(a: Allocation, s: FinancialSnapshot): Violation[] {
  return run(POLICY_RULES, a, s);
}

/** Every rule, structural first. */
export function checkAll(a: Allocation, s: FinancialSnapshot): Violation[] {
  return [...checkStructure(a, s), ...checkPolicy(a, s)];
}

export function worstSeverity(violations: Violation[]): Severity | undefined {
  if (violations.some((v) => v.severity === "high")) return "high";
  if (violations.some((v) => v.severity === "med")) return "med";
  return violations.length ? "low" : undefined;
}

/** Classes whose weight the rewriter is allowed to cut, worst offender first. */
export function overweightClasses(a: Allocation, s: FinancialSnapshot): AssetClass[] {
  const band = RISK_BANDS[s.ips.riskProfile];
  const over: AssetClass[] = [];
  if (sumOf(a.weights, GROWTH_CLASSES) > band.maxGrowth) over.push(...GROWTH_CLASSES);
  if ((a.weights.gold || 0) > MAX_GOLD) over.push("gold");
  return [...new Set(over)];
}
