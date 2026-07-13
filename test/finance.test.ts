import { describe, it, expect } from "vitest";
import {
  allocation,
  computeNudges,
  netWorth,
  spendingInsights,
} from "@/lib/finance/metrics";
import { projectGoal, retirementProjection, goalVerdict } from "@/lib/finance/simulate";
import { buildProfileResponse } from "@/lib/finance/profile";
import { getCustomer } from "@/lib/data/customers";

const priya = () => getCustomer("priya")!;

describe("metrics", () => {
  it("netWorth sums holdings", () => {
    const expected = priya().holdings.reduce((s, h) => s + h.value, 0);
    expect(netWorth(priya())).toBe(expected);
  });

  it("allocation pct sums to ~100", () => {
    const total = allocation(priya()).reduce((s, a) => s + a.pct, 0);
    expect(Math.round(total)).toBe(100);
  });

  it("spendingInsights are positive spends, sorted desc", () => {
    const s = spendingInsights(priya());
    expect(s.every((x) => x.total > 0)).toBe(true);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].total).toBeGreaterThanOrEqual(s[i].total);
  });

  it("computeNudges returns actionable items", () => {
    const n = computeNudges(priya());
    expect(n.length).toBeGreaterThan(0);
    expect(n.some((x) => x.id === "top-spend")).toBe(true);
  });
});

describe("simulate", () => {
  it("retirement future value beats plain contributions due to growth", () => {
    const v = retirementProjection(0, 10000, 10, 12);
    expect(v).toBeGreaterThan(10000 * 12 * 10);
  });

  it("retirement with 0% return equals sum of contributions", () => {
    expect(retirementProjection(0, 10000, 10, 0)).toBe(10000 * 120);
  });

  it("projectGoal returns one row per year through target", () => {
    const rows = projectGoal(
      { id: "g", label: "x", targetAmount: 1e6, targetYear: 2031, current: 0 },
      10000,
      10,
    );
    expect(rows.length).toBe(6); // 2026..2031
    expect(rows[0].year).toBe(2026);
    expect(rows[rows.length - 1].year).toBe(2031);
  });

  it("goalVerdict flags shortfall correctly", () => {
    const v = goalVerdict(
      { id: "g", label: "x", targetAmount: 1e9, targetYear: 2031, current: 0 },
      1000,
      8,
    );
    expect(v.onTrack).toBe(false);
    expect(v.shortfall).toBeGreaterThan(0);
  });
});

describe("profile builder", () => {
  it("returns null for unknown id", () => {
    expect(buildProfileResponse("nobody")).toBeNull();
  });
  it("includes netWorth and nudges for a known id", () => {
    const p = buildProfileResponse("priya")!;
    expect(p.netWorth).toBeGreaterThan(0);
    expect(p.nudges.length).toBeGreaterThan(0);
    expect(p.allocation.length).toBeGreaterThan(0);
  });
});
