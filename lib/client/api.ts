import type { ProfileResponse } from "@/lib/finance/profile";
import type { ChatMsg } from "@/lib/llm/provider";
import type { ProjectionRow, GoalVerdict } from "@/lib/finance/simulate";
import type { Goal } from "@/lib/data/types";

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
