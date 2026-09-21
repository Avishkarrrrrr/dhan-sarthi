import type { MarketSnapshot } from "@/lib/market/nifty";
import { tax } from "./tax";
import { monthlyExpenses } from "@/lib/contracts/snapshot";
import { spendingInsights } from "@/lib/finance/metrics";
import { isPlaceholderCategory } from "@/lib/finance/category";
import {
  LIQUID_CLASSES,
  sumOf,
  type AgentId,
  type AgentView,
  type AssetClass,
  type FinancialSnapshot,
} from "@/lib/contracts/types";

/**
 * The specialist agents.
 *
 * Each one reads the customer's actual position and the live market snapshot
 * and emits a tilt: -1 strongly underweight, +1 strongly overweight. They are
 * deterministic on purpose — the same inputs give the same committee every
 * time, which is what lets the compliance layer downstream be reproducible
 * too, and what stops a demo turning into a coin toss.
 *
 * `sources` only ever cites figures we genuinely have. Where a real desk would
 * read a rate feed we do not have, the agent reasons from the customer's own
 * horizon instead and says so, rather than inventing a number.
 */

export interface AgentContext {
  snapshot: FinancialSnapshot;
  market: MarketSnapshot;
  /**
   * External research, already fetched and sanitised, when a tool provider is
   * configured. Passed *in* rather than fetched here on purpose: an agent that
   * makes a network call is no longer deterministic, and the committee's whole
   * claim is that the same inputs give the same recommendation every time.
   * Absent is the normal case.
   */
  research?: string;
}

export type Agent = (ctx: AgentContext) => AgentView;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Treasury: is the customer liquid enough to take risk at all? Nothing else
 * the committee says matters if next month's rent is in an equity fund.
 */
export const treasury: Agent = ({ snapshot }) => {
  const monthly = monthlyExpenses(snapshot.customer);
  const liquidWeight = sumOf(snapshot.allocationByClass, LIQUID_CLASSES);
  // Net of any lien: the treasury desk's whole job is knowing what is actually
  // available, and locked money is visible to the customer but not to them.
  const liquid = Math.max(0, liquidWeight * snapshot.netWorth - (snapshot.lienMarked ?? 0));
  const months = monthly > 0 ? liquid / monthly : 99;

  // Short of a buffer: pull towards cash. Comfortably over: release some.
  const gap = (6 - months) / 6;
  const tiltCash = clamp(gap);

  return {
    agentId: "treasury",
    tilt: { cash: tiltCash, fd: tiltCash * 0.5, equity: -tiltCash * 0.4, mutual_fund: -tiltCash * 0.4 },
    confidence: monthly > 0 ? 0.85 : 0.4,
    headline:
      months < 6
        ? `Liquidity cover is ${months.toFixed(1)} months — build it before adding risk`
        : `Liquidity cover is ${months.toFixed(1)} months — room to take risk`,
    reasoning:
      months < 6
        ? `Liquid assets cover ${months.toFixed(1)} months of the ${inr(monthly)} a month going out, against a six-month buffer. Until that gap closes, new money is better parked in cash and deposits than in growth assets.`
        : `Liquid assets cover ${months.toFixed(1)} months of the ${inr(monthly)} a month going out, comfortably past the six-month buffer. The excess can work harder elsewhere.`,
    sources: [`Liquid cover ${months.toFixed(1)} months`, `Monthly outgoings ${inr(monthly)}`],
  };
};

/** Markets: trend and momentum on the Nifty, read off the live snapshot. */
export const markets: Agent = ({ market, research }) => {
  const emas = [market.above9Ema, market.above21Ema, market.above55Ema, market.above100Ema];
  const above = emas.filter(Boolean).length;
  // Trend score from EMA stack, tempered by an overbought/oversold RSI.
  const trendScore = (above - 2) / 2;
  const rsiPenalty = market.rsi > 70 ? -0.35 : market.rsi < 30 ? 0.35 : 0;
  const tilt = clamp(trendScore * 0.7 + rsiPenalty);

  return {
    agentId: "markets",
    tilt: { equity: tilt, mutual_fund: tilt * 0.8 },
    confidence: market.live ? 0.7 : 0.45,
    headline:
      tilt > 0.15
        ? `Trend is constructive — ${above} of 4 moving averages reclaimed`
        : tilt < -0.15
          ? `Trend is weak — below ${4 - above} of 4 moving averages`
          : "Trend is mixed — no strong signal either way",
    reasoning: `The Nifty is at ${Math.round(market.nifty).toLocaleString("en-IN")}, above ${above} of its four reference moving averages, with RSI at ${Math.round(market.rsi)}. ${
      market.rsi > 70
        ? "That RSI is stretched, so momentum is worth fading rather than chasing."
        : market.rsi < 30
          ? "That RSI is washed out, which historically favours adding rather than cutting."
          : "Momentum is neither stretched nor washed out."
    }${research ? ` External research adds: ${research.slice(0, 280)}` : ""}`,
    sources: [
      `Nifty ${Math.round(market.nifty).toLocaleString("en-IN")}`,
      `RSI ${Math.round(market.rsi)}`,
      `${above}/4 EMAs reclaimed`,
      // Cited, never silently absorbed: a reader should be able to tell which
      // part of a view came from outside the bank.
      ...(research ? ["External research (Tapetide)"] : []),
    ],
  };
};

/** Volatility: India VIX as the market's own price of fear. */
export const macro: Agent = ({ market }) => {
  // Low VIX is calm (risk-on), high VIX argues for hedges and defensives.
  const stress = clamp((market.indiaVix - 15) / 12);
  return {
    agentId: "macro",
    tilt: { equity: -stress * 0.6, gold: stress * 0.7, bonds: stress * 0.4 },
    confidence: market.live ? 0.65 : 0.4,
    headline:
      stress > 0.2
        ? `Volatility elevated — India VIX at ${market.indiaVix.toFixed(1)}`
        : `Volatility contained — India VIX at ${market.indiaVix.toFixed(1)}`,
    reasoning: `India VIX is ${market.indiaVix.toFixed(1)} against a long-run mid-teens average. ${
      stress > 0.2
        ? "Markets are paying up for protection, which argues for holding hedges and defensives rather than adding risk into the move."
        : "Option markets are calm, which removes the case for defensive positioning on volatility grounds alone."
    }`,
    sources: [`India VIX ${market.indiaVix.toFixed(1)}`, `Trend ${market.trend}`],
  };
};

/**
 * Fixed income: horizon-led. Money needed soon belongs in instruments whose
 * value is known when the goal falls due.
 */
export const bonds: Agent = ({ snapshot }) => {
  const years = snapshot.ips.horizonYears;
  // Under three years, duration and certainty matter more than yield.
  const tilt = clamp((5 - years) / 5);
  return {
    agentId: "bonds",
    tilt: { bonds: tilt * 0.8, fd: tilt * 0.5, equity: -tilt * 0.5, mutual_fund: -tilt * 0.5 },
    confidence: 0.75,
    headline:
      years <= 3
        ? `Nearest goal is ${years} year${years === 1 ? "" : "s"} away — favour certainty`
        : `Nearest goal is ${years} years away — duration risk is affordable`,
    reasoning: `The binding constraint is the nearest goal, ${years} year${years === 1 ? "" : "s"} out, not the longest one. ${
      years <= 3
        ? "Over that horizon a drawdown has no time to recover, so the money belongs where its value is known on the date it is needed."
        : "That is long enough to ride out a normal cycle, so fixed income can play a diversifying rather than a protective role."
    }`,
    sources: [`Nearest goal ${years}y`, `Target corpus ${inr(snapshot.ips.targetCorpus)}`],
  };
};

/** Gold: a hedge sized against how much protection the book already has. */
export const gold: Agent = ({ snapshot, market }) => {
  const held = snapshot.allocationByClass.gold ?? 0;
  const stress = clamp((market.indiaVix - 15) / 12);
  // Want roughly 5-10%; tilt towards that, more so when volatility is up.
  const target = 0.05 + Math.max(0, stress) * 0.05;
  const tilt = clamp((target - held) * 8);
  return {
    agentId: "gold",
    tilt: { gold: tilt },
    confidence: 0.6,
    headline:
      held < target
        ? `Gold at ${pct(held)} — below the ${pct(target)} hedge`
        : `Gold at ${pct(held)} — hedge is adequate`,
    reasoning: `Gold is ${pct(held)} of the portfolio against a ${pct(target)} hedging allocation for current conditions. It is held for its behaviour when equities fall, not for its own return, so the position is sized rather than maximised.`,
    sources: [`Gold held ${pct(held)}`, `India VIX ${market.indiaVix.toFixed(1)}`],
  };
};

/**
 * Behaviour: what the customer's own cash flow says. A concentrated spending
 * pattern or a thin savings rate changes what advice will actually survive
 * contact with their month.
 */
export const behaviour: Agent = ({ snapshot }) => {
  const spends = spendingInsights(snapshot.customer);
  const total = spends.reduce((s, x) => s + x.total, 0);
  const topShare = total > 0 ? (spends[0]?.total ?? 0) / total : 0;
  const savingsRate =
    snapshot.customer.monthlyIncome > 0
      ? snapshot.investableSurplus / snapshot.customer.monthlyIncome
      : 0;

  // A thin savings rate argues for keeping the plan simple and liquid.
  const tilt = clamp((0.2 - savingsRate) * 2);
  return {
    agentId: "behaviour",
    tilt: { cash: tilt * 0.5, equity: -tilt * 0.3 },
    confidence: spends.length > 0 ? 0.6 : 0.3,
    headline:
      savingsRate >= 0.2
        ? `Saving ${pct(savingsRate)} of income — plan can be ambitious`
        : `Saving ${pct(savingsRate)} of income — keep the plan simple`,
    reasoning: `About ${pct(savingsRate)} of income is reaching investments, and the largest spending category is ${pct(topShare)} of monthly outgoings${spends[0] && !isPlaceholder(spends[0].category) ? ` (${spends[0].category})` : ""}. ${
      savingsRate >= 0.2
        ? "That is a healthy rate, so a plan with more moving parts is realistic."
        : "At that rate, a plan that demands regular top-ups is unlikely to survive a bad month — simplicity beats optimisation."
    }`,
    sources: [
      `Savings rate ${pct(savingsRate)}`,
      // The sandbox statement labels rows "S1 TXN 7" rather than describing
      // them. Citing that as a spending category reads as a bug; say plainly
      // that the feed is uncategorised instead.
      spends[0] && !isPlaceholder(spends[0].category)
        ? `Top spend ${spends[0].category}`
        : "Statement feed uncategorised",
    ],
  };
};

/** The committee, in the order they speak. */
export const COMMITTEE: { id: AgentId; agent: Agent }[] = [
  { id: "treasury", agent: treasury },
  { id: "markets", agent: markets },
  { id: "macro", agent: macro },
  { id: "bonds", agent: bonds },
  { id: "gold", agent: gold },
  { id: "behaviour", agent: behaviour },
  { id: "tax", agent: tax },
];

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Core banking returns rows described as "S1 TXN 7" and the AA feed as
 * "F1 FinPro 3" — reference numbers, not descriptions. Presenting one as a
 * spending category makes the product look broken when the data is simply
 * uncategorised.
 */
const isPlaceholder = isPlaceholderCategory;

export type { AssetClass };
