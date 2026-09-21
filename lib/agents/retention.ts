import type {
  FinancialSnapshot,
  OutflowSignal,
  ProposedAction,
  RetentionInsight,
} from "@/lib/contracts/types";
import { classifyCounterparty, DESTINATION_LABEL } from "@/lib/finance/counterparty";
import type { Transaction } from "@/lib/data/types";

/**
 * Deposit-flight radar.
 *
 * Watches for the customer's money leaving the bank — a standing transfer to a
 * broker, a competitor's RTGS, an NBFC deposit — and raises it while there is
 * still a relationship to keep. This reframes the product from a cost centre
 * to revenue protection, which is the thing a bank's board actually loses
 * sleep over.
 *
 * **The counter-offer is not exempt from anything.** It goes through the same
 * compliance pipeline as every other recommendation, for the obvious reason: a
 * retention engine that skips suitability is a mis-selling engine with a
 * commercial motive attached, which is precisely the failure mode the trust
 * layer exists to prevent. Saying that out loud turns a commercial feature into
 * a trust feature.
 */

/** Below this, money leaving is ordinary life, not a departing relationship. */
export const SIGNAL_MIN_AMOUNT = 25_000;
/** Above this share of the balance moving out, the risk is real. */
export const CRITICAL_SHARE = 0.3;
export const ELEVATED_SHARE = 0.15;

function severity(share: number, recurring: boolean): OutflowSignal["severity"] {
  if (share >= CRITICAL_SHARE || (recurring && share >= ELEVATED_SHARE)) return "critical";
  if (share >= ELEVATED_SHARE || recurring) return "elevated";
  return "watch";
}

export function detectOutflows(snapshot: FinancialSnapshot): RetentionInsight {
  const txns: Transaction[] = snapshot.customer.transactions ?? [];

  /*
   * Measured against the balances held *with this bank*, not the customer's
   * whole net worth.
   *
   * Deposit flight is about deposits. Against net worth, a customer moving
   * ₹4.5 lakh out of an ₹11 lakh deposit relationship scores 10% and looks
   * fine, because the denominator included the ₹27 lakh of shares they hold at
   * a broker — money that already left. The share the bank is losing is the
   * number that matters, and by that measure the same customer is 41% gone.
   */
  const withUs = (snapshot.customer.holdings ?? [])
    .filter((h) => h.assetClass === "cash" || h.assetClass === "fd")
    .reduce((s, h) => s + h.value, 0);
  const balance = Math.max(1, withUs || snapshot.netWorth);

  /*
   * Group by destination rather than by transaction. One ₹50,000 transfer is a
   * purchase; five of them to the same broker is a customer moving out, and
   * only the grouped view can tell those apart.
   */
  const groups = new Map<string, { total: number; count: number; hint: string; label: string; last: string }>();

  for (const t of txns) {
    if (t.amount >= 0) continue;
    const amount = Math.abs(t.amount);
    if (amount < SIGNAL_MIN_AMOUNT) continue;

    const cp = classifyCounterparty(t.category);
    if (cp.destination === "unknown") continue;

    const key = `${cp.destination}:${cp.hint}`;
    const g = groups.get(key) ?? { total: 0, count: 0, hint: cp.hint, label: cp.label, last: t.date };
    g.total += amount;
    g.count += 1;
    if (t.date > g.last) g.last = t.date;
    groups.set(key, g);
  }

  const signals: OutflowSignal[] = [...groups.entries()]
    .map(([key, g]) => {
      const destination = key.split(":")[0] as OutflowSignal["destination"];
      const share = g.total / balance;
      const recurring = g.count >= 2;
      return {
        id: key,
        detectedOn: g.last,
        amount: Math.round(g.total / g.count),
        destination,
        counterpartyHint: g.hint,
        recurring,
        trailing3mTotal: Math.round(g.total),
        pctOfBalance: Math.round(share * 1000) / 1000,
        severity: severity(share, recurring),
      };
    })
    .sort((a, b) => b.trailing3mTotal - a.trailing3mTotal);

  const outflow = signals.reduce((s, x) => s + x.trailing3mTotal, 0);
  const inflow = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  /*
   * Risk from size against the balance, sharpened when it recurs. Capped at
   * 0.95: a number that reads 100% invites the RM to stop thinking, and this
   * is an indicator, not a verdict.
   */
  const share = outflow / balance;
  const recurring = signals.some((s) => s.recurring);
  const attritionRisk = Math.min(0.95, share * (recurring ? 1.6 : 1));

  return {
    signals,
    balanceTrend3m: Math.round(inflow - outflow),
    attritionRisk: Math.round(attritionRisk * 100) / 100,
    narrative: narrate(signals, outflow, snapshot),
    counterOffer: counterOffer(outflow, snapshot),
  };
}

function narrate(
  signals: OutflowSignal[],
  outflow: number,
  snapshot: FinancialSnapshot,
): string {
  if (!signals.length) {
    const hasNarration = (snapshot.customer.transactions ?? []).some(
      (t) => classifyCounterparty(t.category).destination !== "unknown",
    );
    return hasNarration
      ? "No money is leaving for a competitor. The relationship looks settled."
      : "This account's statement feed carries no counterparty narration, so outflows cannot be attributed. Nothing here is evidence of a problem — it is an absence of evidence either way.";
  }

  const top = signals[0];
  const name = snapshot.customer.name.split(" ")[0];
  return (
    `${inr(outflow)} has left for ${DESTINATION_LABEL[top.destination]}` +
    `${top.counterpartyHint ? ` (${top.counterpartyHint})` : ""}` +
    `${top.recurring ? ", and it is recurring" : ""}. ` +
    `That is ${pct(top.pctOfBalance)} of what ${name} holds with us. ` +
    `Two more like this and the relationship is gone — worth a call before it is.`
  );
}

/**
 * What to offer instead. Deliberately conservative: the point is to keep a
 * relationship, and an unsuitable product offered to do that loses both the
 * relationship and the argument.
 */
function counterOffer(outflow: number, snapshot: FinancialSnapshot): ProposedAction[] {
  if (outflow <= 0) return [];
  const amount = Math.round(outflow * 0.5);
  return [
    {
      kind: "start_sip",
      instrument: "Nifty 50 Index Fund",
      amount: Math.max(5000, Math.round(amount / 12)),
      reason:
        `The money is going to a broker to buy market exposure. The same exposure is available ` +
        `here, inside the ${snapshot.customer.riskProfile} limits already set for this customer ` +
        `— and it stays visible to whoever advises them.`,
    },
  ];
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pct(w: number): string {
  return `${Math.round(w * 100)}%`;
}
