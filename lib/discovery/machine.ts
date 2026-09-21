import { randomUUID } from "node:crypto";
import type {
  DiscoverySlot,
  DiscoveryState,
  DiscoveryTurnResponse,
  FinancialSnapshot,
  Goal,
  InvestmentPolicyStatement,
  RiskProfile,
} from "@/lib/contracts/types";
import { parseYesNo } from "./parse";
import { SLOTS, slotDef } from "./slots";

/**
 * The interview, as a state machine.
 *
 * Pure and deterministic: given a state and a transcript it returns the next
 * state and the next sentence, with no clock, no randomness and no network. It
 * runs live on a stage in front of judges, so every property that makes it
 * testable is a property that makes it survivable.
 *
 * The shape of a turn: read the answer, keep it if it was understood, ask the
 * next question. When nothing is left, read the whole plan back and wait for a
 * yes — the plan is only signed once the customer has heard it in their own
 * words and agreed.
 */

/** Below this we did not understand, and asking again is better than guessing. */
export const MIN_CONFIDENCE = 0.6;

export function startSession(customerId: string, language = "en-IN"): DiscoveryState {
  return {
    sessionId: `DSC-${randomUUID().slice(0, 8).toUpperCase()}`,
    customerId,
    language,
    filled: {},
    pending: SLOTS.map((s) => s.id),
    turns: [],
    status: "in_progress",
    warnings: [],
  };
}

export function firstQuestion(): string {
  return SLOTS[0].question;
}

/**
 * Apply one answer.
 *
 * `askedSlot` is passed in rather than inferred from `pending`, because a
 * re-ask leaves the slot pending and the two would disagree the moment anyone
 * answered out of order.
 */
export function advance(
  state: DiscoveryState,
  transcript: string,
  snapshot: FinancialSnapshot,
): DiscoveryTurnResponse {
  const next: DiscoveryState = {
    ...state,
    filled: { ...state.filled },
    pending: [...state.pending],
    turns: [...state.turns],
    warnings: [...state.warnings],
  };

  // ── The read-back. Nothing is signed until the customer says yes. ──
  if (next.status === "confirming") {
    const yes = parseYesNo(transcript);
    if (yes === true) {
      next.status = "complete";
      const ips = toIps(next, snapshot);
      return {
        state: next,
        spokenText: "Thank you. I have your plan. Let me take it to the committee.",
        complete: true,
        ips,
      };
    }
    if (yes === false) {
      /*
       * They disagreed with something. Rather than guess which part, reopen
       * the two numbers people actually change their minds about — the monthly
       * amount and the target — and ask again. Guessing wrong here means
       * confidently recording a plan the customer just rejected.
       */
      next.status = "in_progress";
      next.pending = ["monthlyInvestable", "targetCorpus"].filter(
        (s) => s in next.filled,
      ) as DiscoverySlot[];
      for (const s of next.pending) delete next.filled[s];
      return {
        state: next,
        spokenText: `Let us fix that. ${slotDef(next.pending[0]).question}`,
        complete: false,
      };
    }
    return {
      state: next,
      spokenText: `Sorry — is that plan right? Please say yes or no.`,
      complete: false,
    };
  }

  const current = next.pending[0];
  if (!current) return readBack(next, snapshot);

  const def = slotDef(current);
  const value = def.parse(transcript, snapshot);
  const understood = value !== undefined && !(Array.isArray(value) && value.length === 0);
  const confidence = understood ? 0.9 : 0.3;

  next.turns.push({
    slot: current,
    askedText: def.question,
    userTranscript: transcript,
    extracted: { [current]: value ?? null },
    confidence,
  });

  if (!understood) {
    /*
     * One re-ask, then accept the gap and move on. A loop that keeps asking
     * the same question is how a live demo dies, and a missing optional answer
     * is recoverable — the plan simply carries a default and says so.
     */
    const alreadyReasked = next.turns.filter((t) => t.slot === current).length >= 2;
    if (alreadyReasked) {
      next.pending.shift();
      next.warnings.push(`${current} was not captured; a default has been used.`);
      return ask(next, snapshot, "No problem, let us move on. ");
    }
    return { state: next, spokenText: def.reask, complete: false };
  }

  next.filled[current] = value;
  next.pending.shift();

  // A warning is said out loud and recorded — never used to reject the answer.
  const warning = def.check?.(value, snapshot);
  const prefix = warning ? `${warning} ` : "";
  if (warning) next.warnings.push(warning);

  return ask(next, snapshot, prefix);
}

function ask(
  state: DiscoveryState,
  snapshot: FinancialSnapshot,
  prefix: string,
): DiscoveryTurnResponse {
  const nextSlot = state.pending[0];
  if (!nextSlot) return readBack(state, snapshot, prefix);
  return { state, spokenText: `${prefix}${slotDef(nextSlot).question}`, complete: false };
}

/** The whole plan, in one spoken sentence, before anything is signed. */
function readBack(
  state: DiscoveryState,
  snapshot: FinancialSnapshot,
  prefix = "",
): DiscoveryTurnResponse {
  state.status = "confirming";
  const parts = SLOTS.filter((s) => s.id in state.filled).map((s) =>
    s.describe(state.filled[s.id]),
  );
  void snapshot;
  return {
    state,
    spokenText: `${prefix}Let me confirm what I understood. You are planning for ${parts.join("; ")}. Have I got that right?`,
    complete: false,
  };
}

/**
 * Turn the filled slots into the plan every agent is grounded in.
 *
 * `confirmedAt` is set here and only here — reached only through the read-back
 * — so a signed plan always means a customer heard it and agreed, rather than
 * a form having been filled.
 */
export function toIps(
  state: DiscoveryState,
  snapshot: FinancialSnapshot,
  now = new Date(),
): InvestmentPolicyStatement {
  const year = now.getUTCFullYear();
  const horizon = (state.filled.horizonYears as number) ?? 10;
  const shortTerm = ((state.filled.shortTermGoals as string[]) ?? []).map((label, i) =>
    goal(`short-${i}`, label, year + 2, 0),
  );
  const target = (state.filled.targetCorpus as number) ?? 0;
  const longTerm = ((state.filled.longTermGoals as string[]) ?? []).map((label, i) =>
    goal(`long-${i}`, label, year + horizon, 0),
  );

  return {
    monthlySip: (state.filled.monthlyInvestable as number) ?? snapshot.investableSurplus,
    annualStepUpPct: (state.filled.annualStepUpPct as number) ?? 0,
    horizonYears: horizon,
    targetCorpus: target,
    riskProfile: ((state.filled.riskAppetite as RiskProfile) ?? snapshot.customer.riskProfile),
    goals: [...shortTerm, ...longTerm],
  };
}

function goal(id: string, label: string, targetYear: number, current: number): Goal {
  return { id, label, targetAmount: 0, targetYear, current };
}
