import type {
  Allocation,
  ComplianceVerdict,
  EscalationTicket,
  FinancialSnapshot,
  ProposedAction,
} from "@/lib/contracts/types";
import * as queue from "./queue";

/**
 * Human-in-the-loop gate.
 *
 * Most advice must flow straight through — a system that escalates everything
 * is a system nobody uses, and the whole claim is that this works at a hundred
 * thousand customers a day. The gate exists for two reasons, and the second is
 * the one that matters more:
 *
 *  1. the small fraction of cases where a human genuinely adds something —
 *     large sums, advice the rules engine had to correct, a committee that was
 *     unsure of itself;
 *  2. the record on everything else. "A named, licensed human reviewed and
 *     approved this recommendation on this date" is what turns *an AI gave
 *     advice* into *the bank gave advice* — which is why `decidedBy` is a
 *     required part of a decision rather than a nice-to-have.
 *
 * The RM is not blocking the customer's right to buy. The customer can do what
 * they like with their own money. What needs a signature is **the bank
 * recommending it**.
 */

/**
 * Every threshold in one object, so tuning is a single edit and the pitch and
 * the code cannot drift apart.
 */
export const HITL_THRESHOLDS = {
  /** A single action this large gets a second pair of eyes. */
  actionValue: 500_000,
  /** …or an action moving this share of everything the customer has. */
  actionShareOfNetWorth: 0.25,
  /** Below this mean committee confidence, a human adjudicates. */
  confidence: 0.6,
  /** Specialists this far apart are not a committee, they are a coin toss. */
  tiltSpread: 0.8,
  /** Growth assets above this share, against a goal inside `shortHorizonYears`. */
  shortHorizonGrowth: 0.4,
  shortHorizonYears: 3,
} as const;

/** Kept for the older call sites that reason about book size, not action size. */
export const HIGH_VALUE_THRESHOLD = HITL_THRESHOLDS.actionValue;
export const LOW_CONFIDENCE_THRESHOLD = HITL_THRESHOLDS.confidence;

export interface GateInput {
  allocation: Allocation;
  snapshot: FinancialSnapshot;
  verdict: ComplianceVerdict;
  /** Mean confidence across the committee, when there was one. */
  confidence?: number;
  /** Spread between the most bullish and most bearish desk, 0..2. */
  tiltSpread?: number;
  /** What the customer is actually being asked to authorise. */
  actions?: ProposedAction[];
}

/** Why this needs a human, or undefined if it does not. */
export function escalationReason(input: GateInput): EscalationTicket["reason"] | undefined {
  const { allocation, snapshot, verdict, confidence, tiltSpread, actions = [] } = input;

  /*
   * Value is measured on the largest single action, not the book and not the
   * sum. A wealthy customer moving ₹20,000 does not need an RM, and a modest
   * customer putting everything into one instrument very much does — the old
   * net-worth test had both backwards.
   *
   * The sum would be worse than either: a first recommendation restructures
   * most of the book by definition, so summing would escalate every plan on
   * its first run and the queue would become the product. One big, concentrated
   * move is the thing worth a second pair of eyes.
   */
  const tradeable = actions.filter(
    (a) => a.kind === "buy" || a.kind === "sell" || a.kind === "switch",
  );
  const largest = tradeable.reduce((m, a) => Math.max(m, a.amount), 0);
  const share = snapshot.netWorth > 0 ? largest / snapshot.netWorth : 0;
  if (largest >= HITL_THRESHOLDS.actionValue || share > HITL_THRESHOLDS.actionShareOfNetWorth) {
    return "high_value";
  }

  if (confidence !== undefined && confidence < HITL_THRESHOLDS.confidence) return "low_confidence";
  if (tiltSpread !== undefined && tiltSpread > HITL_THRESHOLDS.tiltSpread) return "low_confidence";

  // A rewrite means the machine changed the customer's plan. Someone should see
  // that, and so should anyone asking later why it changed.
  if (verdict.status !== "pass") return "borderline";
  if (verdict.violations.some((v) => v.severity === "med" || v.severity === "high")) {
    return "borderline";
  }

  /*
   * Money needed soon cannot sit in equity, however long the other goals run.
   * The compliance rules judge the same thing, but an equity-heavy plan against
   * a near goal is precisely the "mathematically right, suitability wrong" case
   * a human is meant to catch.
   */
  const growth = (allocation.weights.equity ?? 0) + (allocation.weights.mutual_fund ?? 0);
  const year = new Date().getUTCFullYear();
  const nearest = Math.min(
    ...(snapshot.ips?.goals ?? []).map((g) => g.targetYear - year).filter((h) => h > 0),
    Infinity,
  );
  if (
    growth > HITL_THRESHOLDS.shortHorizonGrowth &&
    nearest <= HITL_THRESHOLDS.shortHorizonYears
  ) {
    return "borderline";
  }

  return undefined;
}

/** Escalate if the thresholds say so, otherwise pass through. */
export function gate(input: GateInput): EscalationTicket | null {
  const reason = escalationReason(input);
  if (!reason) return null;
  return queue.create({
    kind: "advice_approval",
    reason,
    customerId: input.snapshot.customer.id,
    proposed: input.allocation,
    actions: input.actions ?? [],
  });
}
