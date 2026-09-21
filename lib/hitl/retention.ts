import type { EscalationTicket, FinancialSnapshot } from "@/lib/contracts/types";

import { detectOutflows } from "@/lib/agents/retention";
import { evaluate } from "@/lib/compliance/pipeline";
import * as queue from "./queue";

/** Below this, money moving out is not yet a departing relationship. */
export const ALERT_THRESHOLD = 0.2;

/**
 * Raise a retention alert, if one is warranted — and only with an offer that
 * has passed the same suitability checks as any other recommendation.
 *
 * This is the part that matters. A retention engine is a commercial motive
 * pointed at a customer, and a commercial motive that can skip suitability is
 * the exact mechanism behind every mis-selling scandal a bank has been fined
 * for. So the counter-offer is put through the compliance pipeline before the
 * ticket is created, and if it fails, the alert is still raised — with no
 * offer attached and a note saying why. The RM is told there is a problem
 * without being handed an unsuitable product to solve it with.
 */
export function raiseRetentionAlert(snapshot: FinancialSnapshot): EscalationTicket | null {
  const insight = detectOutflows(snapshot);
  if (insight.attritionRisk < ALERT_THRESHOLD) return null;

  // One open alert per customer. A queue that re-raises the same relationship
  // on every page load is a queue the RM stops reading.
  const existing = queue
    .list("pending")
    .find((t) => t.kind === "retention_alert" && t.customerId === snapshot.customer.id);
  if (existing) return existing;

  const { offer, note } = vetOffer(insight.counterOffer, snapshot);

  return queue.create({
    kind: "retention_alert",
    reason: "deposit_flight",
    customerId: snapshot.customer.id,
    retention: { ...insight, counterOffer: offer },
    actions: offer,
    ...(note ? { note } : {}),
  });
}

/**
 * Put the counter-offer through compliance by expressing it as the allocation
 * it would produce, and judging that.
 *
 * Checking the action in isolation would miss the only question worth asking:
 * not "is an index fund a reasonable product" but "is this customer's book,
 * after this, still suitable for them".
 */
function vetOffer(
  offer: EscalationTicket["actions"],
  snapshot: FinancialSnapshot,
): { offer: EscalationTicket["actions"]; note?: string } {
  if (!offer.length) return { offer };

  const annual = offer.reduce((s, a) => s + a.amount * 12, 0);
  const shift = Math.min(0.4, annual / Math.max(1, snapshot.netWorth));

  const weights = { ...snapshot.allocationByClass };
  const fromCash = Math.min(weights.cash, shift);
  weights.cash -= fromCash;
  weights.mutual_fund += fromCash;

  const verdict = evaluate(
    {
      weights,
      expectedReturnPct: 11,
      volatilityPct: 13,
      rationale: "Retention counter-offer: the same market exposure, held here.",
      contributingViews: [],
    },
    snapshot,
  );

  if (verdict.status === "block") {
    return {
      offer: [],
      note:
        "The counter-offer was withheld: it did not pass the suitability checks for this " +
        `customer (${verdict.violations[0]?.detail ?? "unsuitable"}). The outflow is still worth ` +
        "a call — but not with this product.",
    };
  }
  return { offer };
}

/** Sum check used by the tests, kept here so both read the same definition. */
export function totalOutflow(snapshot: FinancialSnapshot): number {
  return detectOutflows(snapshot).signals.reduce((s, x) => s + x.trailing3mTotal, 0);
}

