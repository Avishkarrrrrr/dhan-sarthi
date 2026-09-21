import type { AssetClass, Customer } from "@/lib/data/types";
import { ASSET_LABELS } from "@/lib/format";
import { ASSET_CLASSES, type AgentView } from "@/lib/contracts/types";
import { impliedReturns, posteriorReturns, viewsFromAgents } from "./blacklitterman";

/**
 * Modern Portfolio Theory (Markowitz) optimizer — ported from the reference
 * quant project (hardik1vaibhav/Portfolio-Optimization). That script downloads
 * 5y prices, annualizes log-return means (×252) and covariance (×252), and
 * maximizes the Sharpe ratio (rf = 7%) with weights summing to 1 under bounds,
 * via SciPy SLSQP.
 *
 * Here we optimize across the customer's own asset classes using realistic
 * annualized return/volatility assumptions + an asset-class correlation matrix,
 * and find the max-Sharpe (tangency) and min-volatility portfolios by simulating
 * the efficient frontier (Monte Carlo). This needs no solver, runs in-app, and
 * yields the frontier scatter for visualization.
 */

export const RISK_FREE_RATE = 0.07;
const MAX_WEIGHT = 0.6; // per-asset upper bound (keeps diversification)
const N_PORTFOLIOS = 8000;

// Annualized expected return & volatility assumptions per asset class.
const ASSUMPTIONS: Record<AssetClass, { ret: number; vol: number }> = {
  equity: { ret: 0.13, vol: 0.2 },
  mutual_fund: { ret: 0.115, vol: 0.16 },
  bonds: { ret: 0.08, vol: 0.05 },
  gold: { ret: 0.09, vol: 0.14 },
  fd: { ret: 0.07, vol: 0.012 },
  cash: { ret: 0.035, vol: 0.005 },
};

// Correlation between asset classes (symmetric).
const CORR: Record<AssetClass, Record<AssetClass, number>> = {
  equity: { equity: 1, mutual_fund: 0.9, bonds: -0.1, gold: 0.15, fd: 0.0, cash: 0.0 },
  mutual_fund: { equity: 0.9, mutual_fund: 1, bonds: 0.0, gold: 0.2, fd: 0.05, cash: 0.0 },
  bonds: { equity: -0.1, mutual_fund: 0.0, bonds: 1, gold: 0.1, fd: 0.6, cash: 0.2 },
  gold: { equity: 0.15, mutual_fund: 0.2, bonds: 0.1, gold: 1, fd: 0.0, cash: 0.0 },
  fd: { equity: 0.0, mutual_fund: 0.05, bonds: 0.6, gold: 0.0, fd: 1, cash: 0.3 },
  cash: { equity: 0.0, mutual_fund: 0.0, bonds: 0.2, gold: 0.0, fd: 0.3, cash: 1 },
};

export interface PortfolioMetrics {
  return: number; // annualized, fraction
  volatility: number; // annualized, fraction
  sharpe: number;
}

export interface AssetWeight {
  assetClass: AssetClass;
  label: string;
  current: number; // 0..1
  optimal: number; // 0..1
}

export interface FrontierPoint {
  volatility: number;
  return: number;
  sharpe: number;
}

export interface MptResult {
  assets: AssetWeight[];
  current: PortfolioMetrics;
  optimal: PortfolioMetrics;
  minVol: PortfolioMetrics;
  frontier: FrontierPoint[];
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}

function portfolioVol(weights: number[], cov: number[][]): number {
  let v = 0;
  for (let i = 0; i < weights.length; i++)
    for (let j = 0; j < weights.length; j++) v += weights[i] * weights[j] * cov[i][j];
  return Math.sqrt(Math.max(0, v));
}

function metrics(weights: number[], mu: number[], cov: number[][]): PortfolioMetrics {
  const ret = dot(weights, mu);
  const vol = portfolioVol(weights, cov);
  const sharpe = vol > 0 ? (ret - RISK_FREE_RATE) / vol : 0;
  return { return: ret, volatility: vol, sharpe };
}

/** Random weight vector: exponentials normalized, re-drawn until within bounds. */
function randomWeights(n: number): number[] {
  for (let attempt = 0; attempt < 40; attempt++) {
    const raw = Array.from({ length: n }, () => -Math.log(1 - Math.random()));
    const sum = raw.reduce((s, x) => s + x, 0);
    const w = raw.map((x) => x / sum);
    if (w.every((x) => x <= MAX_WEIGHT)) return w;
  }
  // Fallback: clip + renormalize.
  const eq = Array.from({ length: n }, () => 1 / n);
  return eq;
}

/**
 * Optimise, optionally through the committee's eyes.
 *
 * With no views this is plain Markowitz on the house return assumptions. With
 * views it becomes Black-Litterman: the return vector is replaced by a
 * posterior that starts from what the customer's own holdings imply and is
 * moved by each desk in proportion to how sure that desk is. The frontier and
 * the Sharpe search are unchanged — only what the optimiser believes about
 * returns differs, which is exactly the separation Black-Litterman is for.
 */
export function optimizePortfolio(customer: Customer, views?: AgentView[]): MptResult {
  // Aggregate current holdings by asset class.
  const byClass = new Map<AssetClass, number>();
  for (const h of customer.holdings) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.value);
  const classes = [...byClass.keys()];
  const total = [...byClass.values()].reduce((s, v) => s + v, 0) || 1;
  const currentWeights = classes.map((c) => (byClass.get(c) ?? 0) / total);

  const vols = classes.map((c) => ASSUMPTIONS[c].vol);
  const cov = classes.map((ci, i) => classes.map((cj, j) => CORR[ci][cj] * vols[i] * vols[j]));

  /*
   * Returns. House assumptions when nobody has a view; otherwise the
   * Black-Litterman posterior, anchored on what the customer's current
   * holdings imply the market expects rather than on our own point estimates.
   */
  let mu = classes.map((c) => ASSUMPTIONS[c].ret);
  if (views?.length) {
    const pi = impliedReturns(cov, currentWeights);
    // `viewsFromAgents` indexes by the full ASSET_CLASSES order; this customer
    // may hold only some, so views on classes they do not hold are dropped
    // rather than silently applied to whichever class happens to sit there.
    const indexOf = new Map(classes.map((c, i) => [c, i]));
    const mapped = viewsFromAgents(views, ASSET_CLASSES.map((c) => {
      const i = indexOf.get(c);
      return i === undefined ? 0 : pi[i];
    }))
      .map((v) => ({ ...v, asset: indexOf.get(ASSET_CLASSES[v.asset]) ?? -1 }))
      .filter((v) => v.asset >= 0);
    mu = posteriorReturns(cov, pi, mapped);
  }

  const n = classes.length;
  let best = { w: currentWeights, m: metrics(currentWeights, mu, cov) };
  let minV = { w: currentWeights, m: best.m };
  const frontier: FrontierPoint[] = [];

  for (let k = 0; k < N_PORTFOLIOS; k++) {
    const w = randomWeights(n);
    const m = metrics(w, mu, cov);
    if (k % 40 === 0) frontier.push({ volatility: m.volatility, return: m.return, sharpe: m.sharpe });
    if (m.sharpe > best.m.sharpe) best = { w, m };
    if (m.volatility < minV.m.volatility) minV = { w, m };
  }

  const assets: AssetWeight[] = classes.map((c, i) => ({
    assetClass: c,
    label: ASSET_LABELS[c] ?? c,
    current: currentWeights[i],
    optimal: best.w[i],
  }));

  return {
    assets,
    current: metrics(currentWeights, mu, cov),
    optimal: best.m,
    minVol: minV.m,
    frontier: frontier.sort((a, b) => a.volatility - b.volatility),
  };
}

/** Simulated rebalance orders to move from current → optimal weights. */
export interface RebalanceOrder {
  label: string;
  side: "BUY" | "SELL";
  amount: number;
}

export function rebalanceOrders(result: MptResult, netWorth: number): RebalanceOrder[] {
  return result.assets
    .map((a) => {
      const delta = (a.optimal - a.current) * netWorth;
      return { label: a.label, side: delta >= 0 ? ("BUY" as const) : ("SELL" as const), amount: Math.abs(Math.round(delta)) };
    })
    .filter((o) => o.amount > netWorth * 0.005)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Expected return and volatility for an arbitrary set of class weights, under
 * the same assumptions and correlations the optimizer uses. This lets the
 * compliance layer restate the risk of an allocation it has rewritten, rather
 * than carrying the original proposal's now-wrong numbers forward.
 */
export function weightedMetrics(
  weights: Partial<Record<AssetClass, number>>,
): PortfolioMetrics {
  const classes = Object.keys(ASSUMPTIONS) as AssetClass[];
  const w = classes.map((c) => weights[c] ?? 0);
  const mu = classes.map((c) => ASSUMPTIONS[c].ret);
  const vols = classes.map((c) => ASSUMPTIONS[c].vol);
  const cov = classes.map((ci, i) => classes.map((cj, j) => CORR[ci][cj] * vols[i] * vols[j]));
  return metrics(w, mu, cov);
}
