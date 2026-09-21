import type {
  AgentView,
  FinancialSnapshot,
  TaxAction,
  TaxOptimization,
} from "@/lib/contracts/types";
import type { Holding } from "@/lib/data/types";
import {
  AS_OF,
  ELSS_LOCK_IN_YEARS,
  LONG_TERM_DAYS_EQUITY,
  LTCG_ANNUAL_EXEMPTION,
  LTCG_RATE_EQUITY,
  SECTION_80C_LIMIT,
  STCG_RATE_EQUITY,
  daysBetween,
  financialYear,
  marginalRate,
} from "@/lib/finance/tax-rules";
import type { Agent } from "./agents";

/**
 * The tax desk.
 *
 * Every other specialist argues about *returns*, which are a forecast. This
 * one deals in rupees that are saved or not saved with certainty — no market
 * has to cooperate for a holding-period alert to be right. That is why it is
 * worth having, and also why it must be scrupulous: a tax saving quoted
 * without its conditions is a mis-sale wearing a spreadsheet.
 *
 * Two conditions this desk always states rather than buries:
 *  - **80C is an old-regime deduction.** For someone on the new regime an
 *    ELSS purchase saves exactly nothing, so the number is quoted as
 *    conditional, never as money in hand.
 *  - **ELSS locks money up for three years.** A liquidity cost presented as a
 *    pure saving is not a saving.
 *
 * What it can compute depends entirely on whether the holdings carry purchase
 * dates. The bank's own APIs do not supply them, so against live IDBI data the
 * desk reports the 80C headroom and the tax drag on deposit interest, and says
 * plainly that gains work needs a cost basis it does not have.
 */

const GROWTH = new Set(["equity", "mutual_fund"]);

/** Gain on one holding, split by holding period. Undefined without lots. */
function gains(h: Holding, now: Date) {
  if (!h.lots?.length) return undefined;
  const units = h.lots.reduce((s, l) => s + l.quantity, 0);
  if (units <= 0) return undefined;
  const nav = h.value / units;

  let shortTerm = 0;
  let longTerm = 0;
  const ripening: { days: number; gain: number; quantity: number }[] = [];

  for (const lot of h.lots) {
    const gain = (nav - lot.costPerUnit) * lot.quantity;
    const held = daysBetween(lot.acquiredOn, now);
    if (held >= LONG_TERM_DAYS_EQUITY) {
      longTerm += gain;
    } else {
      shortTerm += gain;
      if (gain > 0) {
        ripening.push({ days: LONG_TERM_DAYS_EQUITY - held, gain, quantity: lot.quantity });
      }
    }
  }
  return { shortTerm, longTerm, ripening, nav };
}

export function optimiseTax(snapshot: FinancialSnapshot, now = new Date()): TaxOptimization {
  const holdings = snapshot.customer.holdings ?? [];
  const actions: TaxAction[] = [];

  let unrealisedShort = 0;
  let unrealisedLong = 0;

  for (const h of holdings) {
    if (!GROWTH.has(h.assetClass)) continue;
    const g = gains(h, now);
    if (!g) continue;
    unrealisedShort += g.shortTerm;
    unrealisedLong += g.longTerm;

    /*
     * The holding-period alert: the cheapest advice in the product. Selling
     * eleven days early costs the difference between the short and long rate,
     * on a gain that already exists. Nothing has to go right for this to pay.
     */
    for (const r of g.ripening) {
      const saving = r.gain * (STCG_RATE_EQUITY - LTCG_RATE_EQUITY);
      if (saving < 500) continue;
      actions.push({
        kind: "hold_for_ltcg",
        instrument: h.name,
        quantity: r.quantity,
        estimatedSaving: Math.round(saving),
        daysToLongTerm: r.days,
        detail: `Selling this in ${r.days} days instead of today makes the gain long-term — ${pct(STCG_RATE_EQUITY)} becomes ${pct(LTCG_RATE_EQUITY)}.`,
      });
    }

    // A loss is only worth booking if there are gains for it to offset.
    if (g.shortTerm < 0 && unrealisedLong + unrealisedShort > g.shortTerm) {
      const saving = Math.abs(g.shortTerm) * STCG_RATE_EQUITY;
      if (saving >= 500) {
        actions.push({
          kind: "loss_harvest",
          instrument: h.name,
          estimatedSaving: Math.round(saving),
          detail: `Booking this loss offsets ${inr(Math.abs(g.shortTerm))} of gains realised elsewhere this year.`,
        });
      }
    }
  }

  /*
   * Realised gains would come from a transaction history of sales. The bank
   * statement shows money moving, not what was sold, so this stays zero rather
   * than being guessed — and the exemption left is therefore the full one.
   */
  const realised = { shortTerm: 0, longTerm: 0 };
  const exemptionRemaining = Math.max(0, LTCG_ANNUAL_EXEMPTION - realised.longTerm);

  if (unrealisedLong > 0 && exemptionRemaining > 0) {
    const harvest = Math.min(unrealisedLong, exemptionRemaining);
    actions.push({
      kind: "ltcg_harvest",
      instrument: "Long-term equity holdings",
      estimatedSaving: Math.round(harvest * LTCG_RATE_EQUITY),
      detail: `Realising ${inr(harvest)} of long-term gains this year uses an exemption that does not carry forward, and resets your cost basis tax-free.`,
    });
  }

  /*
   * 80C. We cannot see what the customer has already claimed — payroll and
   * insurance premiums are not in this data — so the headroom is reported as
   * the full limit with that stated, rather than a confident number built on
   * an assumption.
   */
  const used = 0;
  const gap = SECTION_80C_LIMIT - used;
  const slab = marginalRate(snapshot.customer.monthlyIncome * 12);
  if (gap > 0 && slab > 0) {
    actions.push({
      kind: "80c_gap",
      instrument: "ELSS (tax-saving equity fund)",
      estimatedSaving: Math.round(gap * slab),
      detail: `Worth up to ${inr(gap * slab)} at your ${pct(slab)} slab — but only if you file under the old regime, and ELSS locks the money up for ${ELSS_LOCK_IN_YEARS} years.`,
    });
  }

  return {
    financialYear: financialYear(now),
    realisedGains: realised,
    unrealisedGains: {
      shortTerm: Math.round(unrealisedShort),
      longTerm: Math.round(unrealisedLong),
    },
    ltcgExemptionRemaining: exemptionRemaining,
    section80cUsed: used,
    section80cGap: gap,
    actions: actions.sort((a, b) => b.estimatedSaving - a.estimatedSaving),
    totalEstimatedSaving: actions.reduce((s, a) => s + a.estimatedSaving, 0),
  };
}

/**
 * The desk's view for the committee.
 *
 * Its tilt is small by design. Tax is a reason to prefer one wrapper over
 * another, not a reason to change how much risk someone carries — a portfolio
 * built to minimise tax is a portfolio built for the wrong objective.
 */
export const tax: Agent = ({ snapshot }) => {
  const opt = optimiseTax(snapshot);
  const hasLots = (snapshot.customer.holdings ?? []).some((h) => h.lots?.length);
  const interest = deposits(snapshot);
  const slab = marginalRate(snapshot.customer.monthlyIncome * 12);
  const drag = interest * slab;

  const sources = [`Rates: ${AS_OF}`];
  sources.push(hasLots ? `Unrealised long-term ${inr(opt.unrealisedGains.longTerm)}` : "No cost basis available");
  if (drag > 0) sources.push(`Deposit interest taxed at ${pct(slab)}`);

  return {
    agentId: "tax",
    // A nudge toward the equity wrapper, because that is where the favourable
    // treatment lives — not a call to take more risk.
    tilt: { mutual_fund: opt.section80cGap > 0 ? 0.15 : 0.05, fd: drag > 0 ? -0.1 : 0 },
    confidence: hasLots ? 0.72 : 0.5,
    headline: opt.totalEstimatedSaving > 0
      ? `Up to ${inr(opt.totalEstimatedSaving)} of tax available this year`
      : "Nothing to reclaim this year",
    reasoning: hasLots
      ? `${opt.actions.length} tax moves are open for ${opt.financialYear}, worth up to ${inr(opt.totalEstimatedSaving)} — and unlike a return forecast, none of them depend on the market doing anything. ${drag > 0 ? `Separately, about ${inr(interest)} a year of deposit interest is taxed at your ${pct(slab)} slab.` : ""}`
      : `Purchase dates are not in the bank's data, so holding periods and cost basis cannot be computed — the gains work needs a portfolio import first. What can be said: ${inr(opt.section80cGap)} of 80C headroom is unused, worth up to ${inr(opt.section80cGap * slab)} under the old regime${drag > 0 ? `, and roughly ${inr(interest)} a year of deposit interest is taxed at your full ${pct(slab)} slab` : ""}.`,
    sources,
  };
};

/** Rough annual interest from deposits, at a conventional term-deposit rate. */
function deposits(snapshot: FinancialSnapshot): number {
  const value = (snapshot.customer.holdings ?? [])
    .filter((h) => h.assetClass === "fd")
    .reduce((s, h) => s + h.value, 0);
  return value * 0.07;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
