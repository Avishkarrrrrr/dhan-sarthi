/**
 * Every tax rate, limit and exemption in one place.
 *
 * ⚠️ **Verify these against the current Finance Act before they go on a slide.**
 * Capital gains rates, the LTCG exemption and the slab boundaries move most
 * budgets, and a wealth product quoting last year's numbers is worse than one
 * quoting none. They live here, named, precisely so a change is a one-line
 * edit rather than a hunt through the agent code.
 *
 * Encoded below: the post-Finance-(No.2)-Act-2024 capital gains regime and the
 * Budget-2025 new-regime slabs. `AS_OF` is displayed wherever a number derived
 * from these appears, so nobody has to guess how stale it is.
 */

export const AS_OF = "FY 2026-27 (Budget 2025 rates)";

/** The financial year label used on the optimisation record. */
export function financialYear(now = new Date()): string {
  const y = now.getUTCFullYear();
  // India's FY starts in April.
  const start = now.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// ── Capital gains, equity and equity-oriented funds ──────────────────────────

/** Held longer than this, a gain is long-term. */
export const LONG_TERM_DAYS_EQUITY = 365;
/** Unlisted, debt funds, gold and property use a longer clock. */
export const LONG_TERM_DAYS_OTHER = 730;

export const LTCG_RATE_EQUITY = 0.125;
export const STCG_RATE_EQUITY = 0.2;
/** Long-term equity gains up to this much a year are exempt. */
export const LTCG_ANNUAL_EXEMPTION = 125_000;

// ── Deductions ───────────────────────────────────────────────────────────────

/** Section 80C ceiling — ELSS, PPF, life insurance, principal on a home loan. */
export const SECTION_80C_LIMIT = 150_000;

/**
 * 80C is a deduction under the **old** regime only. Someone on the new regime
 * gets nothing from an ELSS purchase, so telling them to make one to "save
 * tax" is advice that costs them liquidity and returns them nothing.
 */
export const SECTION_80C_REQUIRES_OLD_REGIME = true;

/** ELSS carries a statutory lock-in. It must be said out loud, every time. */
export const ELSS_LOCK_IN_YEARS = 3;

// ── Slabs (new regime, the default) ──────────────────────────────────────────

/** Upper bound of each slab and the rate that applies within it. */
export const NEW_REGIME_SLABS: { upTo: number; rate: number }[] = [
  { upTo: 400_000, rate: 0 },
  { upTo: 800_000, rate: 0.05 },
  { upTo: 1_200_000, rate: 0.1 },
  { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.2 },
  { upTo: 2_400_000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

/**
 * The rate the *next* rupee of ordinary income is taxed at.
 *
 * This is what matters for interest: fixed-deposit interest is added to income
 * and taxed at slab, which is why a depositor in the top bracket keeps 70 paise
 * of every rupee of FD interest while long-term equity gains inside the annual
 * exemption are untaxed. Cess and surcharge are deliberately left out — they
 * would add precision the rest of the estimate does not have.
 */
export function marginalRate(annualIncome: number): number {
  for (const slab of NEW_REGIME_SLABS) {
    if (annualIncome <= slab.upTo) return slab.rate;
  }
  return 0.3;
}

/** Days between two dates, floor. */
export function daysBetween(from: string, to: Date = new Date()): number {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.floor(ms / 86_400_000);
}
