import { describe, it, expect } from "vitest";
import snapshotSample from "@/lib/contracts/fixtures/snapshot.sample.json";
import type {
  Allocation,
  ComplianceVerdict,
  FinancialSnapshot,
  ProposedAction,
} from "@/lib/contracts/types";
import { proposeActions, MIN_ACTION_VALUE } from "@/lib/actions/propose";
import { escalationReason, HITL_THRESHOLDS } from "@/lib/hitl/gate";
import { gapAnalysis, projectedCorpus, requiredMonthlySip } from "@/lib/finance/sip";
import { buildIps, committedSavings } from "@/lib/contracts/snapshot";

const snapshot = snapshotSample as FinancialSnapshot;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function plan(weights: Partial<Allocation["weights"]>, gap?: Allocation["gap"]): Allocation {
  return {
    weights: { equity: 0, mutual_fund: 0, bonds: 0, fd: 0, gold: 0, cash: 0, ...weights },
    expectedReturnPct: 10,
    volatilityPct: 12,
    rationale: "test",
    contributingViews: [],
    gap,
  };
}

describe("proposed actions", () => {
  it("turns a change in weights into buys and sells of real instruments", () => {
    const current = snapshot.allocationByClass;
    const target = plan({ ...current, cash: current.cash - 0.2, mutual_fund: current.mutual_fund + 0.2 });
    const actions = proposeActions(target, snapshot);

    const sell = actions.find((a) => a.kind === "sell")!;
    const buy = actions.find((a) => a.kind === "buy")!;
    expect(sell.amount).toBeCloseTo(0.2 * snapshot.netWorth, -2);
    expect(buy.amount).toBeCloseTo(0.2 * snapshot.netWorth, -2);
    // The instrument has to be something the look-through can classify, or the
    // thing the customer approves and the thing we judge are different objects.
    expect(buy.instrument).toBe("Nifty 50 Index Fund");
  });

  it("puts the sell before the buy that it funds", () => {
    const current = snapshot.allocationByClass;
    const actions = proposeActions(
      plan({ ...current, cash: current.cash - 0.3, equity: current.equity + 0.3 }),
      snapshot,
    );
    const kinds = actions.map((a) => a.kind);
    expect(kinds.indexOf("sell")).toBeLessThan(kinds.indexOf("buy"));
  });

  it("ignores moves too small to be worth anyone's attention", () => {
    const current = snapshot.allocationByClass;
    const tiny = MIN_ACTION_VALUE / snapshot.netWorth / 2;
    const actions = proposeActions(
      plan({ ...current, cash: current.cash - tiny, gold: current.gold + tiny }),
      snapshot,
    );
    expect(actions.filter((a) => a.kind === "buy" || a.kind === "sell")).toHaveLength(0);
  });

  it("asks for the step-up when the plan falls short of the goal", () => {
    const actions = proposeActions(
      plan(snapshot.allocationByClass, {
        requiredMonthlySip: 42000,
        statedMonthlySip: 25000,
        shortfall: 17000,
        projectedCorpus: 6_000_000,
        targetCorpus: 10_000_000,
        onTrack: false,
      }),
      snapshot,
    );
    const sip = actions.find((a) => a.kind === "step_up_sip")!;
    expect(sip.amount).toBe(42000);
    expect(sip.reason).toContain("42,000");
  });
});

describe("the escalation gate", () => {
  const pass: ComplianceVerdict = { status: "pass", violations: [], explanation: "" };

  it("lets ordinary, well-spread advice through", () => {
    const current = snapshot.allocationByClass;
    const small = MIN_ACTION_VALUE * 2 / snapshot.netWorth;
    const reason = escalationReason({
      allocation: plan({ ...current, cash: current.cash - small, bonds: current.bonds + small }),
      snapshot,
      verdict: pass,
      confidence: 0.8,
      actions: proposeActions(
        plan({ ...current, cash: current.cash - small, bonds: current.bonds + small }),
        snapshot,
      ),
    });
    expect(reason).toBeUndefined();
  });

  /*
   * Measured on the largest single action, not the sum: a first recommendation
   * restructures most of the book by definition, so summing would escalate
   * every plan on its first run and the queue would become the product.
   */
  it("escalates one large concentrated move, not a spread of small ones", () => {
    const big: ProposedAction[] = [
      { kind: "buy", instrument: "X", amount: HITL_THRESHOLDS.actionValue + 1, reason: "" },
    ];
    const many: ProposedAction[] = Array.from({ length: 10 }, () => ({
      kind: "buy" as const,
      instrument: "X",
      amount: HITL_THRESHOLDS.actionValue / 8,
      reason: "",
    }));
    const base = { allocation: plan(snapshot.allocationByClass), snapshot, verdict: pass, confidence: 0.9 };
    expect(escalationReason({ ...base, actions: big })).toBe("high_value");

    const wealthy = clone(snapshot);
    wealthy.netWorth = 100_000_000; // so the 25% share test cannot fire instead
    expect(escalationReason({ ...base, snapshot: wealthy, actions: many })).toBeUndefined();
  });

  it("escalates when the desks disagree with each other", () => {
    const reason = escalationReason({
      allocation: plan(snapshot.allocationByClass),
      snapshot,
      verdict: pass,
      confidence: 0.9,
      tiltSpread: HITL_THRESHOLDS.tiltSpread + 0.1,
      actions: [],
    });
    expect(reason).toBe("low_confidence");
  });

  it("escalates anything compliance had to correct", () => {
    const reason = escalationReason({
      allocation: plan(snapshot.allocationByClass),
      snapshot,
      verdict: { status: "rewrite", violations: [], explanation: "" },
      confidence: 0.9,
      actions: [],
    });
    expect(reason).toBe("borderline");
  });
});

describe("step-up SIP", () => {
  it("beats a flat SIP over the same horizon", () => {
    const base = { years: 10, annualReturnPct: 11 };
    const flat = projectedCorpus({ ...base, monthly: 20000, stepUpPct: 0 });
    const stepped = projectedCorpus({ ...base, monthly: 20000, stepUpPct: 10 });
    expect(stepped).toBeGreaterThan(flat);
  });

  it("finds a required SIP that actually reaches the target", () => {
    const base = { years: 15, annualReturnPct: 11, stepUpPct: 10 };
    const required = requiredMonthlySip(20_000_000, base);
    expect(projectedCorpus({ ...base, monthly: required })).toBeGreaterThanOrEqual(20_000_000);
    // …and not wildly more than needed.
    expect(projectedCorpus({ ...base, monthly: required * 0.9 })).toBeLessThan(20_000_000);
  });

  it("asks for nothing when existing savings already get there", () => {
    expect(requiredMonthlySip(1_000_000, { years: 10, annualReturnPct: 11, stepUpPct: 0, existing: 2_000_000 })).toBe(0);
  });

  it("reports the shortfall between the stated plan and the goal", () => {
    const gap = gapAnalysis(
      { ...snapshot.ips, monthlySip: 5000, annualStepUpPct: 10, horizonYears: 10, targetCorpus: 10_000_000 },
      11,
    );
    expect(gap.onTrack).toBe(false);
    expect(gap.shortfall).toBeGreaterThan(0);
    expect(gap.requiredMonthlySip).toBeGreaterThan(gap.statedMonthlySip);
  });
});

/*
 * A plan is only honest if the target and the deadline describe the same goal.
 * Summing retirement into a four-year house deposit asked a real customer for
 * ₹3.48 lakh a month against a ₹1.2 lakh income — arithmetically correct, and
 * advice nobody would ever give.
 */
describe("the target belongs to the horizon", () => {
  const person = (goals: { targetYear: number; targetAmount: number; current: number }[]) => ({
    id: "t",
    name: "Test",
    age: 32,
    persona: "test",
    city: "Pune",
    monthlyIncome: 120_000,
    riskProfile: "moderate" as const,
    holdings: [{ assetClass: "cash" as const, name: "Savings", value: 100_000 }],
    transactions: [],
    goals: goals.map((g, i) => ({ id: `g${i}`, label: `Goal ${i}`, ...g })),
  });

  const NOW = new Date("2026-01-01T00:00:00Z");

  it("measures against the nearest goal, not the sum of every goal", () => {
    const ips = buildIps(
      person([
        { targetYear: 2030, targetAmount: 3_000_000, current: 600_000 },
        { targetYear: 2053, targetAmount: 20_000_000, current: 450_000 },
      ]),
      NOW,
    );
    expect(ips.horizonYears).toBe(4);
    expect(ips.targetCorpus).toBe(3_000_000);
    // The long goal is not discarded — it waits for its own horizon.
    expect(ips.goals).toHaveLength(2);
  });

  it("counts only what is set aside for that goal as already saved", () => {
    const c = person([
      { targetYear: 2030, targetAmount: 3_000_000, current: 600_000 },
      { targetYear: 2053, targetAmount: 20_000_000, current: 450_000 },
    ]);
    expect(committedSavings(c, NOW)).toBe(600_000);
  });
});
