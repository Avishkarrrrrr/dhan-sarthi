import type { ProfileResponse } from "@/lib/finance/profile";
import type { ChatMsg } from "@/lib/llm/provider";
import type { ProjectionRow, GoalVerdict } from "@/lib/finance/simulate";
import type { Goal } from "@/lib/data/types";
import type { MarketSnapshot } from "@/lib/market/nifty";
import type { StrategyInput, StrategyResult } from "@/lib/strategy/engine";
import type { CompanyAnalysis } from "@/lib/research/companies";
import type { MptResult } from "@/lib/finance/mpt";

export async function fetchProfile(id: string): Promise<ProfileResponse> {
  const res = await fetch(`/api/profile?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return res.json();
}

export async function postChat(
  customerId: string,
  messages: ChatMsg[],
  language: string,
): Promise<{ reply: string; provider: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, messages, language }),
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

export async function postResearch(companyId: string): Promise<{ analysis: CompanyAnalysis; source: string; company: string }> {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId }),
  });
  if (!res.ok) throw new Error(`research ${res.status}`);
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
