import type { RiskProfile } from "@/lib/data/types";

/**
 * The policy book. Every number a compliance rule tests against lives here and
 * nowhere else, so a reviewer can audit the firm's stance in one screen and a
 * risk officer can change it without touching logic.
 *
 * These are illustrative house limits for the prototype, modelled on the shape
 * of a real advisory suitability policy (SEBI Investment Adviser Regulations
 * 2013, reg. 16 — advice must be suitable to the client's risk profile,
 * investment objective and horizon, with the basis recorded). They are not
 * IDBI's published limits.
 */

export interface RiskBand {
  /** Cap on equity + mutual funds combined, 0..1. */
  maxGrowth: number;
  /** Cap on direct single-stock equity, which carries idiosyncratic risk. */
  maxDirectEquity: number;
  /** Floor on bonds + FD + cash. */
  minDefensive: number;
}

export const RISK_BANDS: Record<RiskProfile, RiskBand> = {
  conservative: { maxGrowth: 0.35, maxDirectEquity: 0.15, minDefensive: 0.5 },
  moderate: { maxGrowth: 0.65, maxDirectEquity: 0.35, minDefensive: 0.2 },
  aggressive: { maxGrowth: 0.85, maxDirectEquity: 0.55, minDefensive: 0.1 },
};

/** Diversification: no single asset class may dominate the book. */
export const MAX_SINGLE_CLASS = 0.65;
/** Above this, a single-class breach stops being fixable by a nudge. */
export const SEVERE_SINGLE_CLASS = 0.8;

/** Gold is a hedge, not a core holding. */
export const MAX_GOLD = 0.2;

/** Sector and single-stock caps, applied when the X-ray can see through. */
export const MAX_SECTOR = 0.35;
export const SEVERE_SECTOR = 0.45;
export const MAX_SINGLE_STOCK = 0.1;

/** Months of expenses that must stay liquid before adding risk assets. */
export const EMERGENCY_MONTHS = 6;

/**
 * Money needed inside this horizon does not belong in growth assets — a market
 * drawdown has no time to recover before the goal falls due.
 */
export const SHORT_HORIZON_YEARS = 3;
export const SHORT_HORIZON_MAX_GROWTH = 0.2;

/** Capital preservation matters more once regular income stops. */
export const SENIOR_AGE = 60;
export const SENIOR_MAX_GROWTH = 0.5;

/**
 * A projected return above this cannot be presented to a retail investor as
 * achievable. SEBI's advertisement code bars assured or misleading return
 * claims; anything north of this is a red line, not a judgement call.
 */
export const MAX_CREDIBLE_RETURN_PCT = 18;

/** Claiming high growth with near-zero volatility understates risk. */
export const RISK_UNDERSTATED_VOL_PCT = 5;

/** Weights must sum to 1 within this tolerance. */
export const WEIGHT_SUM_TOLERANCE = 0.005;

/** How far past a cap a breach must go before it is a block, not a nudge. */
export const SEVERE_BREACH_MARGIN = 0.1;

/** Order in which freed weight is parked when an allocation is rewritten. */
export const DEFENSIVE_SINK = ["bonds", "fd", "cash"] as const;
