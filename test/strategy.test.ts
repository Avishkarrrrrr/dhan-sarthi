import { describe, it, expect } from "vitest";
import { predictStrategy, STRATEGIES } from "@/lib/strategy/engine";
import { syntheticSnapshot } from "@/lib/market/nifty";

const market = syntheticSnapshot();

describe("strategy engine", () => {
  it("always returns a strategy from the taxonomy", () => {
    const r = predictStrategy(
      { investmentAmount: 500000, riskTolerance: "Medium", expectedCagr: 12, investmentHorizon: 5 },
      market,
    );
    expect(STRATEGIES).toContain(r.strategy);
  });

  it("picks a reversal (BOTTOM) in an oversold, weak market", () => {
    const bear = { ...market, above9Ema: false, above21Ema: false, above55Ema: false, above100Ema: false, rsi: 28, trend: "bearish" as const };
    const r = predictStrategy(
      { investmentAmount: 100000, riskTolerance: "Low", expectedCagr: 8, investmentHorizon: 10 },
      bear,
    );
    expect(r.strategy).toBe("BOTTOM");
  });

  it("picks VCP for an aggressive investor in a strong trend", () => {
    const bull = { ...market, above9Ema: true, above21Ema: true, above55Ema: true, above100Ema: true, rsi: 62, indiaVix: 12, trend: "bullish" as const };
    const r = predictStrategy(
      { investmentAmount: 1000000, riskTolerance: "High", expectedCagr: 22, investmentHorizon: 7 },
      bull,
    );
    expect(r.strategy).toBe("VCP");
  });

  it("builds simulated BUY orders that roughly sum to the invested amount", () => {
    const amount = 800000;
    const r = predictStrategy(
      { investmentAmount: amount, riskTolerance: "Medium", expectedCagr: 12, investmentHorizon: 5 },
      market,
    );
    expect(r.orders.length).toBeGreaterThan(0);
    expect(r.orders.every((o) => o.side === "BUY" && o.qty > 0)).toBe(true);
    const total = r.orders.reduce((s, o) => s + o.value, 0);
    expect(Math.abs(total - amount)).toBeLessThan(amount * 0.05);
  });

  it("gives a confidence in the 55-92 band and a rationale", () => {
    const r = predictStrategy(
      { investmentAmount: 300000, riskTolerance: "High", expectedCagr: 20, investmentHorizon: 6 },
      market,
    );
    expect(r.confidence).toBeGreaterThanOrEqual(55);
    expect(r.confidence).toBeLessThanOrEqual(92);
    expect(r.rationale.length).toBeGreaterThan(1);
  });
});
