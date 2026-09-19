import { describe, it, expect, beforeEach } from "vitest";
import allocationSample from "@/lib/contracts/fixtures/allocation.sample.json";
import unsuitableSample from "@/lib/contracts/fixtures/allocation.unsuitable.json";
import snapshotSample from "@/lib/contracts/fixtures/snapshot.sample.json";
import type { Allocation, FinancialSnapshot } from "@/lib/contracts/types";
import { evaluate, run } from "@/lib/compliance/pipeline";
import { checkText, redactText, ensureDisclaimers } from "@/lib/compliance/guardrails";
import { rewriteAllocation } from "@/lib/compliance/rewrite";
import { ASSET_CLASSES, GROWTH_CLASSES, sumOf } from "@/lib/contracts/types";
import { RISK_BANDS, MAX_CREDIBLE_RETURN_PCT } from "@/lib/compliance/policy";
import * as audit from "@/lib/audit/log";
import * as queue from "@/lib/hitl/queue";

const snapshot = snapshotSample as FinancialSnapshot;
const good = allocationSample as Allocation;
const bad = unsuitableSample as Allocation;

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const sum = (a: Allocation) => ASSET_CLASSES.reduce((s, c) => s + a.weights[c], 0);

beforeEach(() => {
  audit.reset();
  queue.reset();
});

describe("the block moment", () => {
  // This fixture is the demo: a plainly unsuitable proposal must be refused,
  // and the refusal must come with something the customer can actually do.
  it("blocks the unsuitable allocation and offers a compliant rewrite", () => {
    const verdict = evaluate(bad, snapshot, bad.rationale);

    expect(verdict.status).toBe("block");
    const rules = verdict.violations.map((v) => v.rule);
    expect(rules).toContain("suitability.growth_cap");
    expect(rules).toContain("suitability.direct_equity_cap");
    expect(rules).toContain("suitability.defensive_floor");
    expect(rules).toContain("liquidity.emergency_fund");
    expect(rules).toContain("sebi.unrealistic_return");
    // The rationale promises a guarantee — the output guard must catch the words too.
    expect(rules).toContain("guardrail.prohibited_language");

    expect(verdict.rewritten).toBeDefined();
    const fixed = verdict.rewritten!;
    expect(sumOf(fixed.weights, GROWTH_CLASSES)).toBeLessThanOrEqual(
      RISK_BANDS.moderate.maxGrowth + 1e-6,
    );
    expect(sum(fixed)).toBeCloseTo(1, 4);
    // And the rewrite must itself be clean, or it is worse than useless.
    expect(evaluate(fixed, snapshot).violations.filter((v) => v.severity === "high")).toHaveLength(0);

    // Said out loud, not in rule ids.
    expect(verdict.explanation).toMatch(/cannot recommend/i);
    expect(verdict.explanation).not.toMatch(/suitability\./);
  });

  it("passes a suitable allocation untouched", () => {
    const verdict = evaluate(good, snapshot, good.rationale);
    expect(verdict.status).toBe("pass");
    expect(verdict.violations.filter((v) => v.severity !== "low")).toHaveLength(0);
  });
});

describe("rules", () => {
  it("rejects weights that do not describe a whole portfolio", () => {
    const a = clone(good);
    a.weights.cash = 0.5;
    expect(evaluate(a, snapshot).violations.map((v) => v.rule)).toContain("schema.weights_sum");
  });

  it("rejects short positions outright", () => {
    const a = clone(good);
    a.weights.bonds = -0.1;
    a.weights.cash = 0.17;
    const verdict = evaluate(a, snapshot);
    expect(verdict.status).toBe("block");
    expect(verdict.violations.map((v) => v.rule)).toContain("schema.negative_weight");
  });

  it("does not run suitability rules over a malformed proposal", () => {
    const a = clone(bad);
    a.weights.equity = Number.NaN;
    const verdict = evaluate(a, snapshot);
    expect(verdict.violations.every((v) => v.rule.startsWith("schema."))).toBe(true);
  });

  it("caps growth harder when the goal is near", () => {
    const near = clone(snapshot);
    near.ips.horizonYears = 2;
    const verdict = evaluate(good, near);
    expect(verdict.violations.map((v) => v.rule)).toContain("suitability.horizon");
  });

  it("caps growth harder once regular income stops", () => {
    const senior = clone(snapshot);
    senior.customer.age = 64;
    senior.ips.riskProfile = "aggressive";
    const a = clone(good);
    a.weights.equity = 0.3;
    a.weights.mutual_fund = 0.45;
    a.weights.bonds = 0.1;
    a.weights.fd = 0.05;
    a.weights.gold = 0.05;
    a.weights.cash = 0.05;
    expect(evaluate(a, senior).violations.map((v) => v.rule)).toContain("suitability.age");
  });

  it("flags a return projection that cannot be presented as achievable", () => {
    const a = clone(good);
    a.expectedReturnPct = MAX_CREDIBLE_RETURN_PCT + 1;
    expect(evaluate(a, snapshot).violations.map((v) => v.rule)).toContain("sebi.unrealistic_return");
  });

  it("is deterministic — the same proposal is judged the same way twice", () => {
    expect(evaluate(bad, snapshot, bad.rationale)).toEqual(evaluate(bad, snapshot, bad.rationale));
  });
});

describe("rewrite", () => {
  it("keeps the customer's own shape rather than substituting a model portfolio", () => {
    const fixed = rewriteAllocation(bad, snapshot)!;
    // Equity was the dominant sleeve; it should still lead the growth side.
    expect(fixed.weights.equity).toBeGreaterThan(0);
    expect(fixed.weights.mutual_fund).toBeGreaterThan(0);
    expect(sum(fixed)).toBeCloseTo(1, 4);
  });

  it("restates risk instead of carrying the original's numbers forward", () => {
    const fixed = rewriteAllocation(bad, snapshot)!;
    expect(fixed.expectedReturnPct).not.toBe(bad.expectedReturnPct);
    expect(fixed.expectedReturnPct).toBeLessThanOrEqual(MAX_CREDIBLE_RETURN_PCT);
    expect(fixed.volatilityPct).toBeGreaterThan(bad.volatilityPct);
  });

  it("gives up rather than offering an alternative it cannot make compliant", () => {
    const empty = clone(good);
    for (const c of ASSET_CLASSES) empty.weights[c] = 0;
    expect(rewriteAllocation(empty, snapshot)).toBeUndefined();
  });
});

describe("output guardrails", () => {
  it("catches a promise of returns however it is phrased", () => {
    expect(checkText("This is a guaranteed 20% return")).toHaveLength(1);
    expect(checkText("A risk-free way to double your money")).toHaveLength(2);
    expect(checkText("Equity carries market risk over time")).toHaveLength(0);
  });

  it("removes the offending sentence but keeps the answer", () => {
    const text = "Your equity share is high. This is a guaranteed winner. Consider rebalancing.";
    const safe = redactText(text);
    expect(safe).not.toMatch(/guaranteed/i);
    expect(safe).toMatch(/Consider rebalancing/);
  });

  it("adds disclaimers once, not on every pass", () => {
    const once = ensureDisclaimers("Here is your plan.");
    expect(ensureDisclaimers(once)).toBe(once);
  });
});

describe("pipeline", () => {
  it("never lets a blocked allocation through as the final one", () => {
    const result = run({ allocation: bad, snapshot, spokenText: bad.rationale });
    expect(result.verdict.status).toBe("block");
    expect(result.finalAllocation).not.toEqual(bad);
    expect(result.finalAllocation).toEqual(result.verdict.rewritten);
    expect(result.spokenText).not.toMatch(/guaranteed/i);
    expect(result.spokenText).toMatch(/market risks/i);
  });

  it("escalates a corrected plan to a human and records the ticket", () => {
    const result = run({ allocation: bad, snapshot, spokenText: bad.rationale });
    expect(result.ticket).not.toBeNull();
    expect(result.ticket!.status).toBe("pending");
    expect(queue.list("pending")).toHaveLength(1);
  });

  it("does not escalate ordinary suitable advice", () => {
    const result = run({ allocation: good, snapshot, spokenText: good.rationale });
    expect(result.ticket).toBeNull();
  });

  it("writes a traceable audit entry for every decision", () => {
    const result = run({ allocation: bad, snapshot, spokenText: bad.rationale });
    const entry = audit.get(result.audit.auditId);
    expect(entry).toBeDefined();
    expect(entry!.customerId).toBe("priya");
    expect(entry!.allocation).toEqual(bad);
    expect(entry!.verdict.status).toBe("block");
    expect(entry!.finalSpokenText).toBe(result.spokenText);
  });

  it("round-trips an RM decision", () => {
    const { ticket } = run({ allocation: bad, snapshot, spokenText: bad.rationale });
    const decided = queue.decide(ticket!.id, "approved");
    expect(decided!.status).toBe("approved");
    expect(queue.list("pending")).toHaveLength(0);
  });
});

describe("rounding", () => {
  it("never lets rounding drift push a capped class back over its cap", () => {
    const fixed = rewriteAllocation(bad, snapshot)!;
    expect(fixed.weights.equity).toBeLessThanOrEqual(RISK_BANDS.moderate.maxDirectEquity);
    expect(sumOf(fixed.weights, GROWTH_CLASSES)).toBeLessThanOrEqual(RISK_BANDS.moderate.maxGrowth);
    expect(sum(fixed)).toBe(1);
  });
});
