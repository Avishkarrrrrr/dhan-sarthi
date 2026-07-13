import { describe, it, expect } from "vitest";
import { optimizePortfolio, rebalanceOrders, RISK_FREE_RATE } from "@/lib/finance/mpt";
import { getCustomer } from "@/lib/data/customers";

const priya = () => getCustomer("priya")!;

describe("MPT optimizer", () => {
  it("returns weights per held asset class that sum to ~1", () => {
    const r = optimizePortfolio(priya());
    expect(r.assets.length).toBeGreaterThan(1);
    const optSum = r.assets.reduce((s, a) => s + a.optimal, 0);
    const curSum = r.assets.reduce((s, a) => s + a.current, 0);
    expect(Math.abs(optSum - 1)).toBeLessThan(0.01);
    expect(Math.abs(curSum - 1)).toBeLessThan(0.01);
  });

  it("optimal Sharpe is at least the current portfolio's Sharpe", () => {
    const r = optimizePortfolio(priya());
    expect(r.optimal.sharpe).toBeGreaterThanOrEqual(r.current.sharpe - 1e-9);
  });

  it("keeps every optimal weight within the 0-0.6 bound", () => {
    const r = optimizePortfolio(priya());
    expect(r.assets.every((a) => a.optimal >= -1e-9 && a.optimal <= 0.6 + 1e-6)).toBe(true);
  });

  it("min-vol portfolio has volatility no greater than the optimal portfolio", () => {
    const r = optimizePortfolio(priya());
    expect(r.minVol.volatility).toBeLessThanOrEqual(r.optimal.volatility + 1e-9);
  });

  it("uses a 7% risk-free rate and produces a frontier", () => {
    expect(RISK_FREE_RATE).toBeCloseTo(0.07);
    const r = optimizePortfolio(priya());
    expect(r.frontier.length).toBeGreaterThan(20);
  });

  it("rebalance orders net to roughly zero (a reallocation, not new money)", () => {
    const r = optimizePortfolio(priya());
    const orders = rebalanceOrders(r, 1000000);
    const net = orders.reduce((s, o) => s + (o.side === "BUY" ? o.amount : -o.amount), 0);
    expect(Math.abs(net)).toBeLessThan(1000000 * 0.05);
  });
});
