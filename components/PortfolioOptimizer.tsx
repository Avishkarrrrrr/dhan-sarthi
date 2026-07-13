"use client";

import { useState } from "react";
import { optimizePortfolio, rebalanceOrders, type MptResult, type RebalanceOrder } from "@/lib/finance/mpt";
import { netWorth as computeNetWorth } from "@/lib/finance/metrics";
import type { Customer } from "@/lib/data/types";
import { FrontierChart } from "./charts/FrontierChart";
import { inrCompact } from "@/lib/format";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function PortfolioOptimizer({
  customer,
  onAskAdvisor,
}: {
  customer: Customer;
  onAskAdvisor: (p: string) => void;
}) {
  const [result, setResult] = useState<MptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebalancing, setRebalancing] = useState<"idle" | "running" | "done">("idle");
  const [filled, setFilled] = useState<RebalanceOrder[]>([]);
  const netWorth = computeNetWorth(customer);

  const run = () => {
    setLoading(true);
    setResult(null);
    setRebalancing("idle");
    setFilled([]);
    // Run on next tick so the "running…" state paints (MC sim is synchronous).
    setTimeout(() => {
      setResult(optimizePortfolio(customer));
      setLoading(false);
    }, 50);
  };

  const rebalance = () => {
    if (!result) return;
    const orders = rebalanceOrders(result, netWorth);
    setRebalancing("running");
    setFilled([]);
    orders.forEach((o, i) => {
      setTimeout(() => {
        setFilled((prev) => [...prev, o]);
        if (i === orders.length - 1) setRebalancing("done");
      }, 600 * (i + 1));
    });
  };

  const uplift = result ? (result.optimal.sharpe - result.current.sharpe).toFixed(2) : "0";

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green/10 text-sm">⚖️</span>
        <h3 className="text-sm font-semibold text-brand-deep">Optimize with Modern Portfolio Theory</h3>
      </div>
      <p className="mb-3 text-xs text-ink/60">
        Markowitz optimization maximizes your risk-adjusted return (Sharpe ratio) across your holdings.
      </p>

      {!result && (
        <button
          onClick={run}
          disabled={loading}
          className="w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Running optimization…" : "Optimize my portfolio"}
        </button>
      )}

      {result && (
        <div className="space-y-3">
          {/* Metrics comparison */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Exp. return" cur={pct(result.current.return)} opt={pct(result.optimal.return)} />
            <Metric label="Volatility" cur={pct(result.current.volatility)} opt={pct(result.optimal.volatility)} lowerBetter />
            <Metric label="Sharpe" cur={result.current.sharpe.toFixed(2)} opt={result.optimal.sharpe.toFixed(2)} />
          </div>
          {Number(uplift) > 0.01 && (
            <p className="rounded-lg bg-brand-green/10 px-3 py-1.5 text-center text-xs font-medium text-brand-green">
              +{uplift} Sharpe uplift by rebalancing to the optimal mix
            </p>
          )}

          {/* Efficient frontier */}
          <FrontierChart frontier={result.frontier} current={result.current} optimal={result.optimal} />

          {/* Weight comparison */}
          <div className="space-y-1.5">
            {result.assets.map((a) => (
              <div key={a.assetClass} className="text-xs">
                <div className="flex justify-between text-ink/70">
                  <span>{a.label}</span>
                  <span>
                    {(a.current * 100).toFixed(0)}% → <span className="font-semibold text-brand-deep">{(a.optimal * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <div className="mt-0.5 flex h-1.5 gap-0.5">
                  <div className="h-full rounded-full bg-ink/15" style={{ width: `${a.current * 100}%` }} />
                  <div className="h-full rounded-full bg-brand-green" style={{ width: `${a.optimal * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Simulated rebalance via broker */}
          {rebalancing === "idle" && (
            <button onClick={rebalance} className="w-full rounded-xl border border-brand-green py-2.5 text-sm font-semibold text-brand-green">
              ⚡ Rebalance via connected broker (simulated)
            </button>
          )}
          {rebalancing !== "idle" && (
            <div className="space-y-1.5">
              {filled.map((o, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-brand-light/60 px-3 py-2 text-xs animate-fade-in">
                  <span className="font-medium text-ink">
                    <span className={`mr-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${o.side === "BUY" ? "bg-brand-green" : "bg-amber-600"}`}>{o.side}</span>
                    {o.label}
                  </span>
                  <span className="text-ink/60">{inrCompact(o.amount)}</span>
                </div>
              ))}
              {rebalancing === "done" && (
                <div className="rounded-lg bg-brand-green/10 px-3 py-2 text-xs font-medium text-brand-green">
                  ✓ Portfolio rebalanced to the MPT-optimal mix (simulated). No real trades executed.
                </div>
              )}
            </div>
          )}

          <button
            onClick={() =>
              onAskAdvisor(
                `Modern Portfolio Theory suggests I rebalance to raise my Sharpe ratio from ${result.current.sharpe.toFixed(2)} to ${result.optimal.sharpe.toFixed(2)}. In simple terms, what does this mean and should I do it?`,
              )
            }
            className="w-full text-center text-xs font-medium text-brand-green underline"
          >
            Ask Dhan Sarthi to explain this →
          </button>
          <p className="text-center text-[10px] text-ink/40">Illustrative optimization on modelled returns. Not investment advice.</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, cur, opt, lowerBetter }: { label: string; cur: string; opt: string; lowerBetter?: boolean }) {
  return (
    <div className="rounded-xl bg-surface py-2">
      <p className="text-[10px] text-ink/50">{label}</p>
      <p className="text-[11px] text-ink/45 line-through">{cur}</p>
      <p className={`text-sm font-bold ${lowerBetter ? "text-brand-deep" : "text-brand-green"}`}>{opt}</p>
    </div>
  );
}
