import type {
  Allocation,
  ComplianceVerdict,
  EscalationTicket,
  FinancialSnapshot,
} from "@/lib/contracts/types";
import * as queue from "./queue";

/**
 * Human-in-the-loop gate.
 *
 * Most advice should flow straight through — a system that escalates
 * everything is a system nobody uses. These thresholds pick out the cases where
 * a human relationship manager genuinely adds something: large sums, decisions
 * the rules engine had to correct, and advice the committee itself was unsure
 * about.
 */

/** Above this portfolio value, a human signs off. */
export const HIGH_VALUE_THRESHOLD = 2_500_000; // ₹25 lakh

/** Below this committee confidence, a human signs off. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export interface GateInput {
  allocation: Allocation;
  snapshot: FinancialSnapshot;
  verdict: ComplianceVerdict;
  /** Mean confidence across the committee, when there was one. */
  confidence?: number;
}

/** Why this needs a human, or undefined if it does not. */
export function escalationReason(input: GateInput): EscalationTicket["reason"] | undefined {
  const { allocation, snapshot, verdict, confidence } = input;
  if (snapshot.netWorth >= HIGH_VALUE_THRESHOLD) return "high_value";
  if (confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD) return "low_confidence";
  // A rewrite means the machine changed the customer's plan. Someone should see that.
  if (verdict.status !== "pass") return "borderline";
  void allocation;
  return undefined;
}

/** Escalate if the thresholds say so, otherwise pass through. */
export function gate(input: GateInput): EscalationTicket | null {
  const reason = escalationReason(input);
  if (!reason) return null;
  return queue.create({
    reason,
    customerId: input.snapshot.customer.id,
    proposed: input.allocation,
  });
}
