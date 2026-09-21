import type {
  Allocation,
  AgentView,
  AuditEntry,
  ComplianceVerdict,
  EscalationTicket,
  FinancialSnapshot,
  ProposedAction,
  TaxOptimization,
  Violation,
} from "@/lib/contracts/types";
import { proposeActions } from "@/lib/actions/propose";
import * as audit from "@/lib/audit/log";
import { gate } from "@/lib/hitl/gate";
import { DISCLAIMERS, checkText, ensureDisclaimers, redactText } from "./guardrails";
import { rewriteAllocation } from "./rewrite";
import { checkPolicy, checkStructure, worstSeverity } from "./rules";

/**
 * The four-stage trust pipeline every recommendation passes through:
 *
 *   1. input firewall — is this a well-formed proposal at all?
 *   2. policy         — the deterministic suitability / concentration / SEBI rules
 *   3. output guard   — the words the avatar will actually say
 *   4. audit          — record the whole decision, traceably
 *
 * Nothing here calls a model. A compliance decision must be reproducible: the
 * same proposal must be judged the same way today and at an inspection in two
 * years, and that is only true if the judgement is arithmetic.
 */

export interface PipelineInput {
  allocation: Allocation;
  snapshot: FinancialSnapshot;
  /** What the avatar intends to say. Vetted and, if needed, redacted. */
  spokenText?: string;
  /** Committee views, recorded in the audit trail. */
  views?: AgentView[];
  /** Mean committee confidence, feeds the escalation gate. */
  confidence?: number;
  /** Spread between the most and least bullish desk, feeds the same gate. */
  tiltSpread?: number;
  /** The tax desk's working, recorded with everything else. */
  tax?: TaxOptimization;
}

export interface PipelineResult {
  verdict: ComplianceVerdict;
  /** The allocation that may actually be acted on — rewritten if there was one. */
  finalAllocation: Allocation;
  /** What the customer is actually being asked to authorise. */
  actions: ProposedAction[];
  /** Vetted, disclaimed text safe to speak. */
  spokenText: string;
  disclaimers: string[];
  ticket: EscalationTicket | null;
  audit: AuditEntry;
}

/**
 * Stages 1–3, without the audit write. Pure: safe to call from a test, a
 * preview, or the committee mid-stream.
 */
export function evaluate(
  allocation: Allocation,
  snapshot: FinancialSnapshot,
  spokenText = "",
): ComplianceVerdict {
  // Stage 1 — input firewall. A malformed proposal is rejected on its own
  // terms; running suitability rules over nonsense would only dress it up.
  const structural = checkStructure(allocation, snapshot);
  if (structural.length) {
    return {
      status: "block",
      violations: structural,
      explanation: explain("block", structural, undefined, snapshot),
    };
  }

  // Stage 2 — policy.
  const policy = checkPolicy(allocation, snapshot);
  // Stage 3 — output guard.
  const language = spokenText ? checkText(spokenText) : [];
  const violations = [...policy, ...language];

  const worst = worstSeverity(violations);
  if (!worst || worst === "low") {
    return { status: "pass", violations, explanation: explain("pass", violations, undefined, snapshot) };
  }

  const rewritten = rewriteAllocation(allocation, snapshot);
  const status = worst === "high" ? "block" : "rewrite";
  return { status, violations, rewritten, explanation: explain(status, violations, rewritten, snapshot) };
}

/** The full pipeline, including escalation and the audit write. */
export function run(input: PipelineInput): PipelineResult {
  const { allocation, snapshot, views = [], confidence } = input;
  const verdict = evaluate(allocation, snapshot, input.spokenText);

  // A blocked proposal must not be acted on; the rewrite is what we offer instead.
  const finalAllocation =
    verdict.status === "pass" ? allocation : verdict.rewritten ?? allocation;

  const safeText = ensureDisclaimers(
    redactText(input.spokenText ?? verdict.explanation) || verdict.explanation,
  );

  /*
   * Actions come from the allocation that may actually be acted on — the
   * rewritten one when compliance replaced the proposal. Proposing trades off
   * an allocation the pipeline just refused would put the blocked plan in
   * front of the customer with an Approve button under it.
   */
  const actions = proposeActions(finalAllocation, snapshot);

  const ticket = gate({
    allocation: finalAllocation,
    snapshot,
    verdict,
    confidence,
    tiltSpread: input.tiltSpread,
    actions,
  });

  const entry = audit.append({
    customerId: snapshot.customer.id,
    views,
    allocation,
    actions,
    verdict,
    hitl: ticket ?? undefined,
    tax: input.tax,
    finalSpokenText: safeText,
  });

  return {
    verdict,
    finalAllocation,
    actions,
    spokenText: safeText,
    disclaimers: DISCLAIMERS,
    ticket,
    audit: entry,
  };
}

/**
 * The explanation the customer hears. This is the demo's moment, so it is
 * written to be said out loud: what was wrong, in plain language, and what we
 * are doing instead — never a rule id or a severity label.
 */
function explain(
  status: ComplianceVerdict["status"],
  violations: Violation[],
  rewritten: Allocation | undefined,
  snapshot: FinancialSnapshot,
): string {
  const name = firstName(snapshot.customer.name);
  if (status === "pass") {
    return violations.length
      ? `${name}, this plan fits your ${snapshot.ips.riskProfile} risk profile. A couple of minor points are noted for your records.`
      : `${name}, this plan fits your ${snapshot.ips.riskProfile} risk profile and our suitability limits.`;
  }

  const serious = violations.filter((v) => v.severity === "high");
  const listed = (serious.length ? serious : violations).slice(0, 2).map((v) => v.detail);
  const reasons = listed.join(" ");

  if (status === "rewrite") {
    return `${name}, I have adjusted this plan before recommending it. ${reasons} The version I am showing you stays inside the limits set for a ${snapshot.ips.riskProfile} investor.`;
  }

  const alternative = rewritten
    ? ` Here is what I can recommend instead: ${describe(rewritten)}.`
    : " I cannot suggest a compliant version of this plan automatically, so I am referring it to a relationship manager.";
  return `${name}, I cannot recommend this. ${reasons}${alternative}`;
}

/** A spoken-word summary of an allocation: the parts that matter, in order. */
function describe(a: Allocation): string {
  const labels: Record<string, string> = {
    equity: "direct equity",
    mutual_fund: "mutual funds",
    bonds: "bonds",
    fd: "fixed deposits",
    gold: "gold",
    cash: "cash",
  };
  return Object.entries(a.weights)
    .filter(([, w]) => w >= 0.05)
    .sort(([, x], [, y]) => y - x)
    .map(([c, w]) => `${Math.round(w * 100)}% ${labels[c] ?? c}`)
    .join(", ");
}

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first) return "There";
  // Core banking returns names in caps; "PRIYA, I cannot..." reads as shouting.
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}
