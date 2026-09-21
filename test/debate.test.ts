import { describe, it, expect } from "vitest";
import type { AgentId, AgentView } from "@/lib/contracts/types";
import { DISAGREEMENT_THRESHOLD, MAX_CONCESSION, MAX_EXCHANGES, debate } from "@/lib/agents/debate";

const view = (
  agentId: AgentId,
  tilt: AgentView["tilt"],
  confidence: number,
  headline = "a reading",
): AgentView => ({ agentId, tilt, confidence, headline, reasoning: "", sources: [] });

describe("the committee argues", () => {
  it("says nothing when the desks broadly agree", () => {
    const { exchanges, views } = debate([
      view("markets", { equity: 0.3 }, 0.7),
      view("macro", { equity: 0.2 }, 0.5),
    ]);
    expect(exchanges).toEqual([]);
    expect(views[0].tilt.equity).toBe(0.3);
  });

  /*
   * Confidence is each desk's own statement about how much it trusts its
   * reading, so using it to decide who yields is using the committee's own
   * information rather than an outside rule.
   */
  it("moves the less confident desk toward the more confident one", () => {
    const { views, exchanges } = debate([
      view("markets", { equity: 0.8 }, 0.9, "Trend is constructive"),
      view("treasury", { equity: -0.6 }, 0.4),
    ]);

    expect(exchanges).toHaveLength(1);
    const [e] = exchanges;
    expect(e.from).toBe("treasury");
    expect(e.to).toBe("markets");
    expect(e.after).toBeGreaterThan(e.before);

    const treasury = views.find((v) => v.agentId === "treasury")!;
    expect(treasury.tilt.equity).toBe(e.after);
    // The confident desk does not move at all.
    expect(views.find((v) => v.agentId === "markets")!.tilt.equity).toBe(0.8);
  });

  /* A desk that abandoned its view the moment someone louder spoke would not
   * be worth seating. */
  it("never concedes the whole position", () => {
    const { exchanges } = debate([
      view("markets", { equity: 1 }, 1),
      view("treasury", { equity: -1 }, 0),
    ]);
    const [e] = exchanges;
    expect(e.after).toBeLessThan(1);
    expect(Math.abs(e.after - e.before)).toBeLessThanOrEqual(2 * MAX_CONCESSION + 1e-9);
  });

  /*
   * A genuine standoff must reach the strategist as a standoff — the
   * escalation gate is watching the spread precisely so a human sees it.
   */
  it("leaves two equally confident desks unresolved, and says so", () => {
    const { exchanges } = debate([
      view("markets", { equity: 0.9 }, 0.7, "Trend is constructive"),
      view("treasury", { equity: -0.9 }, 0.7),
    ]);
    expect(exchanges[0].after).toBe(exchanges[0].before);
    expect(exchanges[0].text).toMatch(/unresolved/i);
  });

  it("spends its time on the biggest disagreement first", () => {
    const { exchanges } = debate([
      view("markets", { equity: 0.9, gold: 0.3 }, 0.8),
      view("treasury", { equity: -0.9, gold: -0.3 }, 0.4),
    ]);
    expect(exchanges[0].assetClass).toBe("equity");
  });

  it("holds at most a readable number of arguments", () => {
    const wide = { equity: 1, mutual_fund: 1, bonds: 1, fd: 1, gold: 1, cash: 1 };
    const { exchanges } = debate([
      view("markets", wide, 0.9),
      view("treasury", { equity: -1, mutual_fund: -1, bonds: -1, fd: -1, gold: -1, cash: -1 }, 0.3),
    ]);
    expect(exchanges.length).toBeLessThanOrEqual(MAX_EXCHANGES);
  });

  it("quotes the argument that actually moved the desk", () => {
    const { exchanges } = debate([
      view("treasury", { equity: -0.8 }, 0.9, "liquidity cover is 0.6 months"),
      view("markets", { equity: 0.8 }, 0.3),
    ]);
    expect(exchanges[0].text).toContain("liquidity cover is 0.6 months");
  });

  /* The original round is what each desk independently believed; both that and
   * the settled position are worth having in the audit trail. */
  it("does not mutate the views it was given", () => {
    const original = [view("markets", { equity: 0.9 }, 0.9), view("treasury", { equity: -0.9 }, 0.2)];
    debate(original);
    expect(original[1].tilt.equity).toBe(-0.9);
  });

  it("ignores a class only one desk has an opinion about", () => {
    const { exchanges } = debate([
      view("gold", { gold: 1 }, 0.9),
      view("markets", { equity: 0.1 }, 0.5),
    ]);
    expect(exchanges).toEqual([]);
  });

  it("only argues above the disagreement threshold", () => {
    const gap = DISAGREEMENT_THRESHOLD - 0.05;
    const { exchanges } = debate([
      view("markets", { equity: gap }, 0.9),
      view("treasury", { equity: 0 }, 0.3),
    ]);
    expect(exchanges).toEqual([]);
  });
});

/*
 * A concession too small to state is not a concession. The first run of this
 * reported "unresolved" while quietly moving the tilt by 0.03 — the number on
 * screen and the sentence beside it have to say the same thing.
 */
describe("the number and the sentence agree", () => {
  it("holds its ground outright rather than moving imperceptibly", () => {
    const { views, exchanges } = debate([
      view("markets", { equity: 0.9 }, 0.72, "Trend is weak"),
      view("macro", { equity: 0.18 }, 0.7),
    ]);
    const [e] = exchanges;
    expect(e.after).toBe(e.before);
    expect(e.text).toMatch(/unresolved/i);
    expect(views.find((v) => v.agentId === "macro")!.tilt.equity).toBe(0.18);
  });

  it("states a move it actually made", () => {
    const { exchanges } = debate([
      view("markets", { equity: 0.9 }, 0.95, "Trend is constructive"),
      view("treasury", { equity: -0.9 }, 0.3),
    ]);
    const [e] = exchanges;
    expect(e.after).not.toBe(e.before);
    expect(e.text).toMatch(/moving our/i);
    expect(e.text).toContain(e.after.toFixed(2));
  });
});
