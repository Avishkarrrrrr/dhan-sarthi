/**
 * Frozen shared contracts (DEV_SPEC §3). Every workstream imports from here so
 * the committee, the trust layer and the UI agree on shapes without importing
 * each other's internals.
 *
 * Two deliberate deviations from the spec text, both documented at the field:
 *  - `ComplianceVerdict.rewritten` is present for `block` as well as `rewrite`,
 *    because a block is far more persuasive when it also offers a safe
 *    alternative.
 *  - `PortfolioXray.bySector` may be empty until the look-through lands
 *    (Workstream C); rules degrade to class-level concentration when it is.
 */
import type {
  AssetClass,
  Customer,
  Goal,
  Holding,
  RiskProfile,
  Transaction,
} from "@/lib/data/types";

export type { AssetClass, Customer, Goal, Holding, RiskProfile, Transaction };

/** Every asset class, in a stable order — iterate this, never Object.keys. */
export const ASSET_CLASSES: readonly AssetClass[] = [
  "equity",
  "mutual_fund",
  "bonds",
  "fd",
  "gold",
  "cash",
] as const;

/** Growth (risk) assets. The suitability caps are expressed against this set. */
export const GROWTH_CLASSES: readonly AssetClass[] = ["equity", "mutual_fund"] as const;

/** Defensive assets — what an investor falls back on when markets turn. */
export const DEFENSIVE_CLASSES: readonly AssetClass[] = ["bonds", "fd", "cash"] as const;

/** Instantly spendable. Emergency-fund cover is measured on these. */
export const LIQUID_CLASSES: readonly AssetClass[] = ["cash", "fd"] as const;

// ============ THE BOOK OF TRUTH (Workstream C) ============

/** Everything the committee needs about one customer, in one object. */
export interface FinancialSnapshot {
  customer: Customer;
  netWorth: number;
  /** Current weights, 0..1, summing to ~1. */
  allocationByClass: Record<AssetClass, number>;
  xray: PortfolioXray;
  /** Investable surplus per month, INR. */
  investableSurplus: number;
  ips: InvestmentPolicyStatement;
}

export interface PortfolioXray {
  byStock: { name: string; weight: number }[];
  /** Empty until the true look-through lands; rules degrade gracefully. */
  bySector: { sector: string; weight: number }[];
  overlapPct: number; // 0..1
  concentrationFlags: string[];
}

/** The persistent grounding for the whole committee. */
export interface InvestmentPolicyStatement {
  monthlySip: number;
  annualStepUpPct: number;
  horizonYears: number;
  targetCorpus: number;
  riskProfile: RiskProfile;
  goals: Goal[];
}

// ============ AGENT LAYER (Workstream A) ============

export type AgentId = "treasury" | "markets" | "macro" | "bonds" | "gold" | "behaviour";

/** Every specialist emits exactly this shape. */
export interface AgentView {
  agentId: AgentId;
  /** Per-class tilt: -1 (strong underweight) .. +1 (strong overweight). */
  tilt: Partial<Record<AssetClass, number>>;
  confidence: number; // 0..1
  headline: string;
  reasoning: string;
  sources: string[];
}

/** Strategist output: the proposed allocation, before compliance sees it. */
export interface Allocation {
  weights: Record<AssetClass, number>; // sums to 1
  expectedReturnPct: number;
  volatilityPct: number;
  rationale: string;
  contributingViews: AgentId[];
}

export type CommitteeEvent =
  | { type: "agent_start"; agentId: AgentId }
  | { type: "agent_view"; view: AgentView }
  | { type: "strategist"; allocation: Allocation }
  | { type: "compliance"; verdict: ComplianceVerdict }
  | { type: "hitl"; ticket: EscalationTicket | null }
  | { type: "final"; answer: FinalAnswer };

export interface FinalAnswer {
  /** Possibly the compliance-rewritten allocation, not the proposed one. */
  allocation: Allocation;
  spokenText: string;
  disclaimers: string[];
  auditId: string;
}

// ============ TRUST LAYER (Workstream B) ============

export type Severity = "low" | "med" | "high";

export interface Violation {
  /** Stable dotted id, e.g. "suitability.growth_cap" — safe to assert on. */
  rule: string;
  detail: string;
  severity: Severity;
}

export interface ComplianceVerdict {
  status: "pass" | "rewrite" | "block";
  violations: Violation[];
  /**
   * The safe replacement allocation. Always present for `rewrite`, and present
   * for `block` whenever a compliant alternative could be computed — a block
   * that also answers "then what should I do?" is the demo moment.
   */
  rewritten?: Allocation;
  explanation: string;
}

export interface EscalationTicket {
  id: string;
  reason: "high_value" | "borderline" | "low_confidence";
  customerId: string;
  proposed: Allocation;
  createdAt: string;
  status: "pending" | "approved" | "modified" | "rejected";
}

export interface AuditEntry {
  auditId: string;
  customerId: string;
  timestamp: string;
  views: AgentView[];
  allocation: Allocation;
  verdict: ComplianceVerdict;
  hitl?: EscalationTicket;
  finalSpokenText: string;
}

/** Zero weights for every class — a safe base for building an Allocation. */
export function emptyWeights(): Record<AssetClass, number> {
  return { equity: 0, mutual_fund: 0, bonds: 0, fd: 0, gold: 0, cash: 0 };
}

/** Sum of the given classes' weights. */
export function sumOf(
  weights: Record<AssetClass, number>,
  classes: readonly AssetClass[],
): number {
  return classes.reduce((s, c) => s + (weights[c] || 0), 0);
}
