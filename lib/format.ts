import type { ProposedAction } from "@/lib/contracts/types";

/** INR formatting with lakh/crore where natural. */
export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Compact INR: ₹1.4L, ₹4.55Cr, ₹32k. */
export function inrCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + "Cr";
  if (abs >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + "L";
  if (abs >= 1e3) return "₹" + (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return "₹" + Math.round(n).toString();
}

export const ASSET_LABELS: Record<string, string> = {
  equity: "Equity",
  mutual_fund: "Mutual Funds",
  bonds: "Bonds",
  fd: "Fixed Deposits",
  gold: "Gold",
  cash: "Cash & Liquid",
};

/** Chart palette derived from the brand green. */
export const CHART_COLORS = ["#0B7A4B", "#12B886", "#38D9A9", "#0CA678", "#087F5B", "#66D9AE", "#2F9E44"];

/**
 * How an action reads on screen. Both approval surfaces use these words, so
 * the customer and the RM are looking at the same sentence — which is the
 * point of `ProposedAction` being one contract rather than two.
 */
export const ACTION_VERB: Record<ProposedAction["kind"], string> = {
  buy: "Buy",
  sell: "Sell",
  start_sip: "Start a SIP into",
  step_up_sip: "Step up the SIP into",
  switch: "Switch into",
  rebalance: "Rebalance",
};

/** Instruments nobody buys or sells — you move money in and out of them. */
const DEPOSIT_LIKE = /savings account|fixed deposit|term deposit|current account/i;

/**
 * The whole phrase, verb and instrument together.
 *
 * "Sell IDBI Savings Account" is what a class-level rebalance produces if the
 * verb is chosen from the action kind alone, and it is not a thing anyone
 * does. A deposit is moved into and out of, so it gets its own wording — the
 * kind stays what the contract says it is, because this is a presentation
 * problem, not a data one.
 */
export function actionPhrase(a: ProposedAction): string {
  if (DEPOSIT_LIKE.test(a.instrument)) {
    if (a.kind === "sell") return `Move money out of your ${a.instrument}`;
    if (a.kind === "buy") return `Move money into your ${a.instrument}`;
  }
  return `${ACTION_VERB[a.kind]} ${a.instrument}`;
}
