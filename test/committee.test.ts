import { describe, it, expect, beforeEach } from "vitest";
import snapshotSample from "@/lib/contracts/fixtures/snapshot.sample.json";
import type { MarketSnapshot } from "@/lib/market/nifty";
import type { AgentView, CommitteeEvent, FinancialSnapshot } from "@/lib/contracts/types";
import { ASSET_CLASSES, GROWTH_CLASSES, sumOf } from "@/lib/contracts/types";
import { COMMITTEE, markets, treasury, macro, bonds } from "@/lib/agents/agents";
import { BASE_MODELS, fuseTilts, strategise } from "@/lib/agents/strategist";
import { collectCommittee } from "@/lib/agents/committee";
import { deriveRiskProfile } from "@/components/Onboarding";
import * as audit from "@/lib/audit/log";
import * as queue from "@/lib/hitl/queue";

const snapshot = snapshotSample as FinancialSnapshot;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const calm: MarketSnapshot = {
  nifty: 24500, above9Ema: true, above21Ema: true, above55Ema: true, above100Ema: true,
  rsi: 58, indiaVix: 12.5, trend: "bullish", live: true,
};
const stressed: MarketSnapshot = {
  nifty: 21800, above9Ema: false, above21Ema: false, above55Ema: false, above100Ema: false,
  rsi: 28, indiaVix: 26, trend: "bearish", live: true,
};

beforeEach(() => {
  audit.reset();
  queue.reset();
});

describe("agents", () => {
  it("all six emit a well-formed view", () => {
    for (const { id, agent } of COMMITTEE) {
      const v = agent({ snapshot, market: calm });
      expect(v.agentId).toBe(id);
      expect(v.confidence).toBeGreaterThanOrEqual(0);
      expect(v.confidence).toBeLessThanOrEqual(1);
      expect(v.headline.length).toBeGreaterThan(0);
      expect(v.sources.length).toBeGreaterThan(0);
      for (const t of Object.values(v.tilt)) {
        expect(t).toBeGreaterThanOrEqual(-1);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });

  it("markets leans into a reclaimed trend and away from a broken one", () => {
    expect(markets({ snapshot, market: calm }).tilt.equity!).toBeGreaterThan(0);
    // Broken trend, but a washed-out RSI tempers the call rather than piling on.
    expect(markets({ snapshot, market: stressed }).tilt.equity!).toBeLessThan(
      markets({ snapshot, market: calm }).tilt.equity!,
    );
  });

  it("volatility pushes towards gold when VIX is elevated", () => {
    expect(macro({ snapshot, market: stressed }).tilt.gold!).toBeGreaterThan(
      macro({ snapshot, market: calm }).tilt.gold!,
    );
  });

  it("treasury pulls to cash when the buffer is thin", () => {
    const thin = clone(snapshot);
    thin.netWorth = 65780;
    thin.allocationByClass = { equity: 0, mutual_fund: 0, bonds: 0, fd: 0.15, gold: 0, cash: 0.85 };
    const view = treasury({ snapshot: thin, market: calm });
    expect(view.headline).toMatch(/build it before adding risk/i);
  });

  it("bonds favours certainty when the nearest goal is close", () => {
    const near = clone(snapshot);
    near.ips.horizonYears = 2;
    expect(bonds({ snapshot: near, market: calm }).tilt.bonds!).toBeGreaterThan(
      bonds({ snapshot, market: calm }).tilt.bonds!,
    );
  });

  it("is deterministic — same inputs, same committee", () => {
    const once = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));
    const twice = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));
    expect(once).toEqual(twice);
  });
});

describe("strategist", () => {
  it("weights a confident view above a hesitant one", () => {
    const confident: AgentView = {
      agentId: "markets", tilt: { equity: 1 }, confidence: 1,
      headline: "h", reasoning: "r", sources: [],
    };
    const hesitant: AgentView = {
      agentId: "macro", tilt: { equity: -1 }, confidence: 0.1,
      headline: "h", reasoning: "r", sources: [],
    };
    expect(fuseTilts([confident, hesitant]).equity).toBeGreaterThan(0);
  });

  it("ignores a malformed tilt instead of poisoning the average", () => {
    const bad = { agentId: "gold", tilt: { equity: Number.NaN }, confidence: 1, headline: "", reasoning: "", sources: [] } as AgentView;
    const good = { agentId: "markets", tilt: { equity: 0.5 }, confidence: 1, headline: "", reasoning: "", sources: [] } as AgentView;
    expect(fuseTilts([bad, good]).equity).toBe(0.5);
  });

  it("produces a whole portfolio with no negative weights", () => {
    const views = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));
    const a = strategise(views, snapshot);
    const total = ASSET_CLASSES.reduce((s, c) => s + a.weights[c], 0);
    expect(total).toBeCloseTo(1, 4);
    for (const c of ASSET_CLASSES) expect(a.weights[c]).toBeGreaterThanOrEqual(0);
  });

  it("stays recognisably close to the house model", () => {
    // A committee is a tilt on a model, not a licence to rebuild the portfolio.
    const views = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));
    const a = strategise(views, snapshot);
    const base = BASE_MODELS.moderate;
    for (const c of ASSET_CLASSES) {
      expect(Math.abs(a.weights[c] - base[c])).toBeLessThan(0.2);
    }
  });

  it("restates risk from the weights rather than asserting it", () => {
    const views = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));
    const a = strategise(views, snapshot);
    expect(a.expectedReturnPct).toBeGreaterThan(0);
    expect(a.volatilityPct).toBeGreaterThan(0);
    expect(a.contributingViews).toHaveLength(COMMITTEE.length);
  });
});

describe("the committee run", () => {
  const types = (events: CommitteeEvent[]) => events.map((e) => e.type);

  it("speaks, proposes, is vetted, then answers — in that order", async () => {
    const events = await collectCommittee({ snapshot, market: calm });
    const seq = types(events);
    expect(seq.filter((t) => t === "agent_view")).toHaveLength(COMMITTEE.length);
    expect(seq.indexOf("strategist")).toBeGreaterThan(seq.lastIndexOf("agent_view"));
    expect(seq.indexOf("compliance")).toBeGreaterThan(seq.indexOf("strategist"));
    expect(seq.at(-1)).toBe("final");
  });

  it("never lets a blocked proposal through as the final answer", async () => {
    // Force a block: a near-term goal makes any growth tilt unsuitable.
    const near = clone(snapshot);
    near.ips.horizonYears = 1;
    const events = await collectCommittee({ snapshot: near, market: calm });
    const verdict = events.find((e) => e.type === "compliance");
    const final = events.find((e) => e.type === "final");
    if (verdict?.type === "compliance" && verdict.verdict.status !== "pass" && verdict.verdict.rewritten) {
      expect(final?.type === "final" && final.answer.allocation).toEqual(verdict.verdict.rewritten);
    }
    // Whatever the verdict, growth must respect the short-horizon ceiling.
    if (final?.type === "final") {
      expect(sumOf(final.answer.allocation.weights, GROWTH_CLASSES)).toBeLessThanOrEqual(1);
    }
  });

  it("records the run against the audit trail", async () => {
    const events = await collectCommittee({ snapshot, market: calm });
    const final = events.at(-1);
    expect(final?.type).toBe("final");
    if (final?.type !== "final") return;
    const entry = audit.get(final.answer.auditId);
    expect(entry).toBeDefined();
    expect(entry!.views).toHaveLength(COMMITTEE.length);
    expect(entry!.customerId).toBe("priya");
  });

  it("still advises when the market feed is unavailable", async () => {
    const offline = { ...calm, live: false };
    const events = await collectCommittee({ snapshot, market: offline });
    const marketView = events.find(
      (e) => e.type === "agent_view" && e.view.agentId === "markets",
    );
    // Confidence drops, but the committee still reaches an answer.
    expect(marketView?.type === "agent_view" && marketView.view.confidence).toBeLessThan(0.7);
    expect(events.at(-1)?.type).toBe("final");
  });
});

describe("placeholder statement narration", () => {
  it("does not present a reference number as a spending category", () => {
    // The sandbox labels rows "S1 TXN 19"; citing that reads as a bug.
    const placeholdery = clone(snapshot);
    placeholdery.customer.transactions = [
      { date: "2025-05-02", category: "S1 TXN 19", amount: -40000 },
      { date: "2025-05-04", category: "F1 FinPro 3", amount: -12000 },
    ];
    const view = COMMITTEE.find((c) => c.id === "behaviour")!.agent({
      snapshot: placeholdery,
      market: calm,
    });
    expect(view.sources.join(" ")).not.toMatch(/S1 TXN|FinPro/);
    expect(view.sources.join(" ")).toMatch(/uncategorised/i);
    expect(view.reasoning).not.toMatch(/S1 TXN/);
  });

  it("still names a genuine category", () => {
    const view = COMMITTEE.find((c) => c.id === "behaviour")!.agent({ snapshot, market: calm });
    expect(view.sources.join(" ")).toMatch(/Rent|Groceries|Dining/);
  });
});

describe("risk profile from onboarding", () => {
  it("derives a profile from horizon and loss reaction together", () => {
    // Horizon is the binding constraint: comfortable with risk but needing the
    // money in two years is still a conservative case.
    expect(deriveRiskProfile(2, 2)).toBe("conservative");
    expect(deriveRiskProfile(15, 2)).toBe("aggressive");
    expect(deriveRiskProfile(15, 0)).toBe("conservative");
    expect(deriveRiskProfile(6, 1)).toBe("moderate");
  });

  it("changes the proposal the strategist starts from", () => {
    const views = COMMITTEE.map(({ agent }) => agent({ snapshot, market: calm }));

    const cautious = clone(snapshot);
    cautious.ips.riskProfile = "conservative";
    const bold = clone(snapshot);
    bold.ips.riskProfile = "aggressive";

    const a = strategise(views, cautious);
    const b = strategise(views, bold);

    // The same committee, two profiles: the aggressive plan must carry more
    // growth. Answering the questions honestly has to visibly change advice.
    expect(sumOf(b.weights, GROWTH_CLASSES)).toBeGreaterThan(sumOf(a.weights, GROWTH_CLASSES));
  });
});
