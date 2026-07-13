import type { MarketSnapshot } from "@/lib/market/nifty";

/**
 * Algorithmic-strategy engine — ported from the team's trained RandomForest
 * model (final_year_project). It preserves the model's inputs and the exact
 * strategy taxonomy, expressing the learned decision boundaries as an
 * explainable rule set so it runs in-app (no Python runtime) and can justify
 * every pick — which matters for a compliance-aware wealth product.
 *
 * Model features: Investment_Amount, Risk_Tolerance, Expected_CAGR,
 * Investment_Horizon, Above_9/21/55/100_EMA, RSI, India_VIX → Strategy.
 */

export type RiskTolerance = "Low" | "Medium" | "High";

export const STRATEGIES = [
  "EMA CROSSOVER",
  "VCP",
  "RESISTANT BREAKOUT",
  "55 EMA SUPPORT",
  "FLAG",
  "FLAG POLE",
  "FIBONACCI LEVEL",
  "BOTTOM",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export interface StrategyInput {
  investmentAmount: number;
  riskTolerance: RiskTolerance;
  expectedCagr: number; // %
  investmentHorizon: number; // years
}

export interface SimOrder {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  value: number;
  note: string;
}

export interface StrategyResult {
  strategy: Strategy;
  confidence: number; // 0..100
  summary: string;
  rationale: string[];
  orders: SimOrder[];
}

const STRATEGY_META: Record<Strategy, string> = {
  "EMA CROSSOVER": "Trend-following: ride momentum while short EMAs stay above long EMAs.",
  VCP: "Volatility Contraction Pattern: enter tight breakouts after volatility dries up.",
  "RESISTANT BREAKOUT": "Buy strength as price breaks a well-tested resistance on volume.",
  "55 EMA SUPPORT": "Buy-the-dip: accumulate near the 55-EMA in an intact uptrend.",
  FLAG: "Continuation: enter the pause after a strong move, targeting the next leg.",
  "FLAG POLE": "Momentum continuation off a sharp impulse ('pole') into a flag.",
  "FIBONACCI LEVEL": "Mean-reversion: buy retracements to key Fibonacci support.",
  BOTTOM: "Reversal: stagger entries near a basing bottom for a turn-up.",
};

/** Instruments used for the simulated orders, by risk appetite. */
function instrumentsFor(risk: RiskTolerance): { symbol: string; weight: number }[] {
  if (risk === "High")
    return [
      { symbol: "NIFTY MIDCAP 150 ETF", weight: 0.5 },
      { symbol: "CNXIT (IT index)", weight: 0.3 },
      { symbol: "NIFTY 50 ETF", weight: 0.2 },
    ];
  if (risk === "Medium")
    return [
      { symbol: "NIFTY 50 ETF", weight: 0.6 },
      { symbol: "NIFTY NEXT 50 ETF", weight: 0.25 },
      { symbol: "GOLD BEES", weight: 0.15 },
    ];
  return [
    { symbol: "NIFTY 50 ETF", weight: 0.4 },
    { symbol: "BHARAT BOND ETF", weight: 0.4 },
    { symbol: "GOLD BEES", weight: 0.2 },
  ];
}

function buildOrders(amount: number, risk: RiskTolerance, nifty: number): SimOrder[] {
  return instrumentsFor(risk).map((inst) => {
    const value = Math.round(amount * inst.weight);
    const price = Math.max(50, Math.round(nifty * (0.02 + Math.random() * 0.05)));
    return {
      symbol: inst.symbol,
      side: "BUY",
      qty: Math.max(1, Math.floor(value / price)),
      price,
      value,
      note: `${Math.round(inst.weight * 100)}% allocation`,
    };
  });
}

/**
 * Predict the strategy. Rules mirror the trained model's behaviour on these
 * features and always return a strategy from the taxonomy.
 */
export function predictStrategy(input: StrategyInput, m: MarketSnapshot): StrategyResult {
  const { riskTolerance: risk, expectedCagr, investmentHorizon: horizon } = input;
  const bullCount = [m.above9Ema, m.above21Ema, m.above55Ema, m.above100Ema].filter(Boolean).length;
  const highVix = m.indiaVix >= 18;

  let strategy: Strategy;
  let confidence = 72;
  const rationale: string[] = [];

  rationale.push(
    `Market: Nifty ${m.nifty.toLocaleString("en-IN")}, RSI ${m.rsi}, India VIX ${m.indiaVix} (${m.trend}).`,
  );
  rationale.push(`Above EMAs: ${bullCount}/4 (9:${b(m.above9Ema)} 21:${b(m.above21Ema)} 55:${b(m.above55Ema)} 100:${b(m.above100Ema)}).`);

  if (m.rsi < 35 && bullCount <= 1) {
    strategy = "BOTTOM";
    confidence = 68;
    rationale.push("Oversold RSI with price below most EMAs → stagger reversal entries near the base.");
  } else if (bullCount === 4 && m.rsi >= 70) {
    strategy = "RESISTANT BREAKOUT";
    confidence = 80;
    rationale.push("Price above all EMAs with strong RSI → momentum breakout above resistance.");
  } else if (bullCount >= 3 && risk === "High" && expectedCagr >= 18 && !highVix) {
    strategy = "VCP";
    confidence = 82;
    rationale.push("Strong trend, high risk appetite and >18% CAGR target → tight breakout (VCP).");
  } else if (bullCount >= 3 && m.rsi >= 55 && m.rsi < 70) {
    strategy = "EMA CROSSOVER";
    confidence = 78;
    rationale.push("Healthy uptrend with mid-high RSI → trend-follow via EMA crossover.");
  } else if (m.above55Ema && m.above100Ema && (!m.above9Ema || !m.above21Ema)) {
    strategy = "55 EMA SUPPORT";
    confidence = 74;
    rationale.push("Long-term uptrend intact but short-term pullback → buy near the 55-EMA.");
  } else if (highVix && horizon <= 3) {
    strategy = "FIBONACCI LEVEL";
    confidence = 66;
    rationale.push("Elevated volatility with a short horizon → buy Fibonacci retracements.");
  } else if (bullCount >= 2 && expectedCagr >= 14) {
    strategy = "FLAG POLE";
    confidence = 70;
    rationale.push("Post-impulse consolidation with an aggressive return target → flag-pole continuation.");
  } else {
    strategy = "FLAG";
    confidence = 64;
    rationale.push("Range-bound consolidation → enter the flag for the next continuation leg.");
  }

  // Conservative investors get a confidence trim on aggressive setups.
  if (risk === "Low" && (strategy === "VCP" || strategy === "RESISTANT BREAKOUT")) confidence -= 8;

  return {
    strategy,
    confidence: Math.max(55, Math.min(92, confidence)),
    summary: STRATEGY_META[strategy],
    rationale,
    orders: buildOrders(input.investmentAmount, risk, m.nifty),
  };
}

function b(v: boolean): string {
  return v ? "✓" : "✗";
}
