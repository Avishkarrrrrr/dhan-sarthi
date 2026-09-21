import type { ProfileResponse } from "@/lib/finance/profile";
import type { ChatMsg } from "@/lib/llm/provider";
import type { ProjectionRow, GoalVerdict } from "@/lib/finance/simulate";
import type { Goal } from "@/lib/data/types";
import type { MarketSnapshot } from "@/lib/market/nifty";
import type { StrategyInput, StrategyResult } from "@/lib/strategy/engine";
import type { CompanyAnalysis } from "@/lib/research/companies";
import type { MptResult } from "@/lib/finance/mpt";
import type { CustomerSummary, Transaction } from "@/lib/data/types";
import type { JourneyStep, KycProfile } from "@/lib/integrations/aa";
import type { AuditEntry, CommitteeEvent, ComplianceVerdict, Allocation, EscalationTicket } from "@/lib/contracts/types";

export async function fetchProfile(id: string): Promise<ProfileResponse> {
  const res = await fetch(`/api/profile?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return res.json();
}

export async function postChat(
  customerId: string,
  messages: ChatMsg[],
  language: string,
  holdings?: import("@/lib/data/types").Holding[],
): Promise<{ reply: string; provider: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, messages, language, holdings }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}

export interface GoalSimResult {
  goal: Goal;
  rows: ProjectionRow[];
  verdict: GoalVerdict;
}

export async function postSimulateGoal(
  customerId: string,
  goalId: string,
  monthlyContribution: number,
  annualReturnPct: number,
): Promise<GoalSimResult> {
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "goal", customerId, goalId, monthlyContribution, annualReturnPct }),
  });
  if (!res.ok) throw new Error(`simulate ${res.status}`);
  return res.json();
}

export interface RetirementSimResult {
  rows: ProjectionRow[];
  projected: number;
  years: number;
}

export async function postSimulateRetirement(
  customerId: string,
  monthlyContribution: number,
  annualReturnPct: number,
  currentCorpus: number,
  years: number,
): Promise<RetirementSimResult> {
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "retirement", customerId, monthlyContribution, annualReturnPct, currentCorpus, years }),
  });
  if (!res.ok) throw new Error(`simulate ${res.status}`);
  return res.json();
}

export async function postStrategy(input: StrategyInput): Promise<{ market: MarketSnapshot; result: StrategyResult }> {
  const res = await fetch("/api/strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`strategy ${res.status}`);
  return res.json();
}

export async function postResearch(
  params: { companyId?: string; query?: string },
): Promise<{ analysis: CompanyAnalysis; source: string; company: string }> {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `research ${res.status}`);
  }
  return res.json();
}

export async function postOptimize(customerId: string): Promise<{ result: MptResult; netWorth: number }> {
  const res = await fetch("/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  if (!res.ok) throw new Error(`optimize ${res.status}`);
  return res.json();
}

/**
 * Customer roster. Fetched rather than imported so the browser never bundles
 * the demo dataset, and so a live IDBI roster can replace it without a rebuild.
 */
export async function fetchCustomers(): Promise<{
  customers: CustomerSummary[];
  source: "mock" | "idbi";
  degraded?: boolean;
}> {
  const res = await fetch("/api/customers");
  if (!res.ok) throw new Error(`customers ${res.status}`);
  return res.json();
}

export interface AaJourneyResponse {
  status: "active" | "pending" | "failed";
  steps: JourneyStep[];
  consentHandle?: string;
  consentId?: string;
  linkRefNumbers: string[];
  kyc?: KycProfile;
  balance: number;
  transactions: Transaction[];
  paymentModes: { mode: string; count: number }[];
}

/**
 * Run the Account Aggregator consent journey. Returns the step-by-step trace
 * of the real calls to IDBI's FinPro sandbox, plus what the consent unlocked.
 */
export async function postAaJourney(customerId: string): Promise<AaJourneyResponse> {
  const res = await fetch("/api/aa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `aa ${res.status}`);
  }
  return res.json();
}

export interface ComplianceResponse extends ComplianceVerdict {
  finalAllocation: Allocation;
  spokenText: string;
  disclaimers: string[];
  ticket: EscalationTicket | null;
  auditId: string;
}

/** Vet a proposed allocation against the deterministic suitability rules. */
export async function postCompliance(params: {
  allocation: Allocation;
  customerId?: string;
  snapshot?: unknown;
  spokenText?: string;
}): Promise<ComplianceResponse> {
  const res = await fetch("/api/compliance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `compliance ${res.status}`);
  }
  return res.json();
}

/** Pending escalations waiting on a relationship manager. */
export async function fetchRmQueue(status?: EscalationTicket["status"]): Promise<EscalationTicket[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/rm/queue${qs}`);
  if (!res.ok) throw new Error(`rm queue ${res.status}`);
  return res.json();
}

/** Record the relationship manager's decision on one escalation. */
export async function postRmDecision(
  ticketId: string,
  decision: "approved" | "modified" | "rejected",
  modified?: Allocation,
): Promise<EscalationTicket> {
  const res = await fetch("/api/rm/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId, decision, modified }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `rm decide ${res.status}`);
  }
  return res.json();
}

/** The recent decision trail. */
export async function fetchAuditTrail(limit = 50): Promise<{ entries: AuditEntry[] }> {
  const res = await fetch(`/api/audit?limit=${limit}`);
  if (!res.ok) throw new Error(`audit ${res.status}`);
  return res.json();
}

/**
 * Run the investment committee, streaming each event as it happens.
 *
 * The server sends newline-delimited JSON. Lines can be split across chunks,
 * so the tail of each read is held back until a newline actually arrives —
 * parsing per-chunk drops events under any real network.
 */
export async function streamCommittee(
  customerId: string,
  onEvent: (e: CommitteeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/committee", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
    signal,
  });
  if (!res.ok || !res.body) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `committee ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      try {
        onEvent(JSON.parse(text) as CommitteeEvent);
      } catch {
        // A malformed line should not kill the rest of the run.
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as CommitteeEvent);
    } catch {
      /* ignore */
    }
  }
}
