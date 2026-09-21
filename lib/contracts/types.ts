/**
 * Frozen shared contracts (DEV_SPEC §3). Every workstream imports from here so
 * the committee, the trust layer and the UI agree on shapes without importing
 * each other's internals.
 *
 * Two deliberate deviations from the spec text, both documented at the field:
 *  - `ComplianceVerdict.rewritten` is present for `block` as well as `rewrite`,
 *    because a block is far more persuasive when it also offers a safe
 *    alternative.
 *  - `PortfolioXray.bySector` is a share of equity exposure rather than of net
 *    worth, and carries provenance fields the spec does not list, because the
 *    look-through runs on indicative category models and must say so.
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
  /** Named companies reached through every wrapper, as a share of net worth. */
  byStock: { name: string; weight: number }[];
  /**
   * Sectors, as a share of **equity exposure** — not of net worth.
   *
   * A sector limit is judged against the equity sleeve, because that is the
   * money exposed to it. Measured against net worth instead, a portfolio could
   * be entirely in one sector and still look fine simply by holding a large
   * fixed deposit beside it.
   *
   * Empty only when there is no equity to look through — which is the true
   * state of a customer holding nothing but a term deposit, not a gap.
   */
  bySector: { sector: string; weight: number }[];
  overlapPct: number; // 0..1 of equity exposure, bought twice
  concentrationFlags: string[];
  /** Equity once hybrids are unwrapped, as a share of net worth. */
  effectiveEquityPct?: number;
  /** What the class labels claim — equity + mutual_fund — for comparison. */
  headlineEquityPct?: number;
  /** Equity the look-through could not model, 0..1 of equity exposure. */
  unclassifiedPct?: number;
  /** Equity resolved to named companies, 0..1 of equity exposure. */
  stockCoverage?: number;
  /** Per-holding detail, so the screen can show its working. */
  vehicles?: { name: string; value: number; category: string; equityValue: number; classified: boolean }[];
  /** Provenance of the category models. Displayed, never hidden. */
  asOf?: string;
  source?: string;
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

export type AgentId =
  | "treasury"
  | "markets"
  | "macro"
  | "bonds"
  | "gold"
  | "behaviour"
  | "tax";

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
/** Does the stated SIP, stepped up each year, actually reach the target? */
export interface GapAnalysis {
  requiredMonthlySip: number;
  statedMonthlySip: number;
  /** > 0 means they are under-investing by this much a month. */
  shortfall: number;
  projectedCorpus: number;
  targetCorpus: number;
  onTrack: boolean;
}

export interface Allocation {
  weights: Record<AssetClass, number>; // sums to 1
  expectedReturnPct: number;
  volatilityPct: number;
  rationale: string;
  contributingViews: AgentId[];
  /** Optional: absent on a hand-built proposal with no plan behind it. */
  gap?: GapAnalysis;
}

// ============ TAX (the Tax desk) ============

/** One purchase lot. Without an acquisition date there is no holding period. */
export interface TaxLot {
  acquiredOn: string; // ISO date
  quantity: number;
  costPerUnit: number;
}

export interface TaxAction {
  kind: "ltcg_harvest" | "loss_harvest" | "80c_gap" | "hold_for_ltcg";
  instrument: string;
  quantity?: number;
  /** INR. The headline number — certain, unlike a projected return. */
  estimatedSaving: number;
  detail: string;
  daysToLongTerm?: number;
}

export interface TaxOptimization {
  financialYear: string;
  realisedGains: { shortTerm: number; longTerm: number };
  unrealisedGains: { shortTerm: number; longTerm: number };
  ltcgExemptionRemaining: number;
  section80cUsed: number;
  section80cGap: number;
  actions: TaxAction[];
  totalEstimatedSaving: number;
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
  actions: ProposedAction[];
  tax?: TaxOptimization;
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

/**
 * A concrete thing to do. The customer sees it on their Action Card as "approve
 * this"; the RM sees the same object as "does the bank stand behind this".
 */
export interface ProposedAction {
  kind: "buy" | "sell" | "start_sip" | "step_up_sip" | "switch" | "rebalance";
  instrument: string;
  /** INR. The gate reads this, not net worth — a big book is not a big action. */
  amount: number;
  reason: string;
}

/** The RM console has one tab per kind. */
export type TicketKind = "advice_approval" | "retention_alert";

export interface EscalationTicket {
  id: string;
  kind: TicketKind;
  reason: "high_value" | "borderline" | "low_confidence" | "deposit_flight";
  customerId: string;
  /** Present on an advice approval. */
  proposed?: Allocation;
  /** Present on a retention alert. */
  retention?: RetentionInsight;
  actions: ProposedAction[];
  createdAt: string;
  status: "pending" | "approved" | "modified" | "rejected";
  /**
   * The named human who signed. Required once a decision is recorded — this
   * record *is* the deliverable: it is what turns "an AI gave advice" into
   * "the bank gave advice, and this person is accountable for it".
   */
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

/** Money leaving the bank, spotted in the transaction feed. */
export type OutflowDestination =
  | "external_broker"
  | "competitor_bank"
  | "nbfc_deposit"
  | "mf_platform"
  | "unknown";

export interface OutflowSignal {
  id: string;
  detectedOn: string;
  amount: number;
  destination: OutflowDestination;
  /** What the statement narration hinted at — "ZERODHA", "HDFC BANK". */
  counterpartyHint: string;
  recurring: boolean;
  trailing3mTotal: number;
  pctOfBalance: number;
  severity: "watch" | "elevated" | "critical";
}

export interface RetentionInsight {
  signals: OutflowSignal[];
  /** Net change in balances over the window, INR. */
  balanceTrend3m: number;
  attritionRisk: number; // 0..1
  narrative: string;
  /**
   * A suitable IDBI alternative. Runs through the same compliance pipeline as
   * any other recommendation — a retention engine that skips suitability is a
   * mis-selling engine.
   */
  counterOffer: ProposedAction[];
}

export interface AuditEntry {
  auditId: string;
  customerId: string;
  timestamp: string;
  views: AgentView[];
  allocation: Allocation;
  verdict: ComplianceVerdict;
  actions?: ProposedAction[];
  hitl?: EscalationTicket;
  /**
   * The customer's own decision on their Action Card.
   *
   * Deliberately on the same entry as `hitl.decidedBy`: the customer consents
   * to their money, the bank signs for its advice, and the pairing of those two
   * signatures on one record is the whole accountability chain. Split across
   * two logs it proves nothing.
   */
  customerDecision?: "approved" | "declined";
  customerDecidedAt?: string;
  tax?: TaxOptimization;
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
