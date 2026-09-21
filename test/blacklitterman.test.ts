import { describe, it, expect } from "vitest";
import type { AgentView } from "@/lib/contracts/types";
import { ASSET_CLASSES } from "@/lib/contracts/types";
import {
  DELTA,
  MAX_VIEW_SHIFT,
  impliedReturns,
  invert,
  posteriorReturns,
  viewsFromAgents,
} from "@/lib/finance/blacklitterman";

/** A tiny, well-conditioned covariance for three assets. */
const COV = [
  [0.04, 0.01, 0.0],
  [0.01, 0.0225, 0.005],
  [0.0, 0.005, 0.0025],
];

describe("linear algebra", () => {
  it("inverts a matrix", () => {
    const inv = invert(COV);
    const product = COV.map((row, i) =>
      row.map((_, j) => row.reduce((s, x, k) => s + x * inv[k][j], 0)),
    );
    product.forEach((row, i) =>
      row.forEach((x, j) => expect(x).toBeCloseTo(i === j ? 1 : 0, 6)),
    );
  });

  /*
   * A degenerate covariance must degrade the optimiser to "no adjustment",
   * not take down a page that is otherwise showing the customer real data.
   */
  it("returns the identity for a singular matrix instead of throwing", () => {
    const singular = [
      [1, 2],
      [2, 4],
    ];
    expect(invert(singular)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });
});

describe("equilibrium", () => {
  it("implies higher returns for the riskier asset at equal weight", () => {
    const pi = impliedReturns(COV, [1 / 3, 1 / 3, 1 / 3]);
    expect(pi[0]).toBeGreaterThan(pi[1]);
    expect(pi[1]).toBeGreaterThan(pi[2]);
  });

  it("scales with risk aversion", () => {
    const w = [0.5, 0.3, 0.2];
    const a = impliedReturns(COV, w, DELTA);
    const b = impliedReturns(COV, w, DELTA * 2);
    expect(b[0]).toBeCloseTo(a[0] * 2, 10);
  });
});

describe("the posterior", () => {
  const pi = impliedReturns(COV, [0.5, 0.3, 0.2]);

  it("leaves the equilibrium alone when nobody has a view", () => {
    expect(posteriorReturns(COV, pi, [])).toEqual(pi);
  });

  it("moves towards a view, and further when the desk is sure", () => {
    const timid = posteriorReturns(COV, pi, [{ asset: 0, q: pi[0] + 0.05, confidence: 0.2 }]);
    const certain = posteriorReturns(COV, pi, [{ asset: 0, q: pi[0] + 0.05, confidence: 1 }]);

    expect(timid[0]).toBeGreaterThan(pi[0]);
    expect(certain[0]).toBeGreaterThan(timid[0]);
    // …and never past the view itself. Evidence shifts a belief; it does not
    // overshoot it.
    expect(certain[0]).toBeLessThanOrEqual(pi[0] + 0.05);
  });

  it("lets a view on one asset move a correlated one", () => {
    const post = posteriorReturns(COV, pi, [{ asset: 0, q: pi[0] + 0.06, confidence: 0.9 }]);
    // Assets 0 and 1 are positively correlated, so believing in one says
    // something about the other. That spillover is the whole reason to use a
    // covariance matrix rather than adjusting returns one at a time.
    expect(post[1]).toBeGreaterThan(pi[1]);
    expect(post[2]).toBeCloseTo(pi[2], 3);
  });
});

describe("turning committee tilts into views", () => {
  const pi = new Array(ASSET_CLASSES.length).fill(0.1);

  const view = (tilt: Partial<Record<string, number>>, confidence: number): AgentView => ({
    agentId: "markets",
    tilt: tilt as AgentView["tilt"],
    confidence,
    headline: "",
    reasoning: "",
    sources: [],
  });

  it("caps how far an opinion can move a return", () => {
    const [v] = viewsFromAgents([view({ equity: 1 }, 1)], pi);
    expect(v.q).toBeCloseTo(0.1 + MAX_VIEW_SHIFT, 10);
  });

  /*
   * Silence is not a view of zero. A desk that said nothing about gold leaves
   * the equilibrium alone; a zero view would actively argue the market is
   * wrong about it.
   */
  it("produces no view for an asset nobody mentioned", () => {
    const views = viewsFromAgents([view({ equity: 0.5 }, 0.8)], pi);
    expect(views).toHaveLength(1);
    expect(ASSET_CLASSES[views[0].asset]).toBe("equity");
  });

  it("weights disagreeing desks by their confidence", () => {
    const [v] = viewsFromAgents(
      [view({ gold: 1 }, 0.9), view({ gold: -1 }, 0.1)],
      pi,
    );
    // The confident bull wins, but the bear pulls the number back.
    expect(v.q).toBeGreaterThan(0.1);
    expect(v.q).toBeLessThan(0.1 + MAX_VIEW_SHIFT);
  });
});
