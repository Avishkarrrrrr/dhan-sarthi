import { getMarketSnapshot, syntheticSnapshot, type MarketSnapshot } from "@/lib/market/nifty";
import { run as runCompliance } from "@/lib/compliance/pipeline";
import { DISCLAIMERS } from "@/lib/compliance/guardrails";
import { ASSET_CLASSES, type AgentView, type CommitteeEvent, type FinancialSnapshot } from "@/lib/contracts/types";
import { COMMITTEE } from "./agents";
import { strategise } from "./strategist";

/**
 * Runs the investment committee and streams what happens.
 *
 * The order is the product: specialists speak, the strategist fuses them into
 * one allocation, compliance vets that allocation, a human is brought in if
 * the thresholds say so, and only then is there an answer. Streaming it is not
 * decoration — showing the compliance step arriving *after* a proposal, and
 * sometimes overruling it, is the part a bank cares about.
 */

export interface CommitteeInput {
  snapshot: FinancialSnapshot;
  /** The customer's question, echoed into the spoken answer. */
  query?: string;
  /** Injectable so tests need no network. */
  market?: MarketSnapshot;
}

export async function* runCommittee(input: CommitteeInput): AsyncGenerator<CommitteeEvent> {
  const { snapshot } = input;

  // Live market data if we can get it, synthetic if we cannot. A market feed
  // being down should slow the committee's conviction, not stop the advice.
  const market = input.market ?? (await safeMarket());

  const views: AgentView[] = [];
  for (const { id, agent } of COMMITTEE) {
    yield { type: "agent_start", agentId: id };
    const view = agent({ snapshot, market });
    views.push(view);
    yield { type: "agent_view", view };
  }

  const allocation = strategise(views, snapshot);
  yield { type: "strategist", allocation };

  const confidence = views.reduce((s, v) => s + v.confidence, 0) / (views.length || 1);
  const result = runCompliance({
    allocation,
    snapshot,
    spokenText: allocation.rationale,
    views,
    confidence,
    tiltSpread: tiltSpread(views),
  });

  yield { type: "compliance", verdict: result.verdict };
  yield { type: "hitl", ticket: result.ticket };

  yield {
    type: "final",
    answer: {
      // Never the proposal when compliance replaced it.
      allocation: result.finalAllocation,
      actions: result.actions,
      spokenText: result.spokenText,
      disclaimers: DISCLAIMERS,
      auditId: result.audit.auditId,
    },
  };
}

/**
 * How far apart the desks are, on the class they disagree about most.
 *
 * A committee whose members point in opposite directions has not reached a
 * view — it has averaged two of them, and the average is nobody's
 * recommendation. That is a case for a human, so the gate gets to see it.
 */
function tiltSpread(views: AgentView[]): number {
  let widest = 0;
  for (const cls of ASSET_CLASSES) {
    const tilts = views.map((v) => v.tilt[cls] ?? 0);
    widest = Math.max(widest, Math.max(...tilts) - Math.min(...tilts));
  }
  return widest;
}

async function safeMarket(): Promise<MarketSnapshot> {
  try {
    return await getMarketSnapshot();
  } catch {
    return syntheticSnapshot();
  }
}

/** Collect the whole run — for tests and for callers that cannot stream. */
export async function collectCommittee(input: CommitteeInput): Promise<CommitteeEvent[]> {
  const events: CommitteeEvent[] = [];
  for await (const e of runCommittee(input)) events.push(e);
  return events;
}
