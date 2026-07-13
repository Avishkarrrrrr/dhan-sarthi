"use client";

import { useState } from "react";
import { postStrategy } from "@/lib/client/api";
import type { MarketSnapshot } from "@/lib/market/nifty";
import type { RiskTolerance, StrategyResult, SimOrder } from "@/lib/strategy/engine";
import { inr, inrCompact } from "@/lib/format";

type BrokerState = "idle" | "connecting" | "connected" | "automating" | "done";

export function StrategyStudio({ onAskAdvisor }: { onAskAdvisor: (p: string) => void }) {
  const [amount, setAmount] = useState(500000);
  const [risk, setRisk] = useState<RiskTolerance>("Medium");
  const [cagr, setCagr] = useState(14);
  const [horizon, setHorizon] = useState(5);
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [broker, setBroker] = useState<BrokerState>("idle");
  const [filled, setFilled] = useState<SimOrder[]>([]);

  const predict = async () => {
    setLoading(true);
    setResult(null);
    setBroker("idle");
    setFilled([]);
    try {
      const { market, result } = await postStrategy({
        investmentAmount: amount,
        riskTolerance: risk,
        expectedCagr: cagr,
        investmentHorizon: horizon,
      });
      setMarket(market);
      setResult(result);
    } catch {
      /* leave empty; UI shows retry */
    } finally {
      setLoading(false);
    }
  };

  const connect = () => {
    setBroker("connecting");
    setTimeout(() => setBroker("connected"), 1400);
  };

  const automate = () => {
    if (!result) return;
    setBroker("automating");
    setFilled([]);
    result.orders.forEach((o, i) => {
      setTimeout(() => {
        setFilled((prev) => [...prev, o]);
        if (i === result.orders.length - 1) setBroker("done");
      }, 700 * (i + 1));
    });
  };

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-bold text-brand-deep">Strategy Studio</h2>
        <p className="text-xs text-ink/55">
          ML-predicted algorithmic strategy from your inputs + live Nifty technicals.
        </p>
      </div>

      {/* Inputs */}
      <section className="space-y-4 rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
        <Slider label="Investment amount" value={amount} min={50000} max={5000000} step={50000} onChange={setAmount} display={inr(amount)} />
        <div>
          <p className="mb-1 text-sm text-ink/70">Risk tolerance</p>
          <div className="grid grid-cols-3 gap-2">
            {(["Low", "Medium", "High"] as RiskTolerance[]).map((r) => (
              <button
                key={r}
                onClick={() => setRisk(r)}
                className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                  risk === r ? "border-brand-green bg-brand-green text-white" : "border-brand-light bg-white text-ink/70"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <Slider label="Expected return (CAGR)" value={cagr} min={6} max={30} step={1} onChange={setCagr} display={`${cagr}%`} />
        <Slider label="Investment horizon" value={horizon} min={1} max={20} step={1} onChange={setHorizon} display={`${horizon} yr`} />
        <button
          onClick={predict}
          disabled={loading}
          className="w-full rounded-xl bg-brand-green py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-50"
        >
          {loading ? "Reading the market…" : "Predict my strategy"}
        </button>
      </section>

      {market && result && (
        <>
          {/* Market snapshot */}
          <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-deep">Live market snapshot</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${market.live ? "bg-brand-green/10 text-brand-green" : "bg-amber-100 text-amber-700"}`}>
                {market.live ? "● Live" : "Simulated"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Nifty 50" value={market.nifty.toLocaleString("en-IN")} />
              <Stat label="RSI (14)" value={String(market.rsi)} />
              <Stat label="India VIX" value={String(market.indiaVix)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([["9", market.above9Ema], ["21", market.above21Ema], ["55", market.above55Ema], ["100", market.above100Ema]] as [string, boolean][]).map(([n, v]) => (
                <span key={n} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${v ? "bg-brand-green/10 text-brand-green" : "bg-ink/5 text-ink/40"}`}>
                  {v ? "▲" : "▼"} {n} EMA
                </span>
              ))}
            </div>
          </section>

          {/* Predicted strategy */}
          <section className="rounded-2xl border border-brand-green/30 bg-brand-light/50 p-4 shadow-soft">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-green">Predicted strategy</p>
            <div className="mt-1 flex items-baseline justify-between">
              <h3 className="text-xl font-bold text-brand-deep">{result.strategy}</h3>
              <span className="text-sm font-semibold text-brand-green">{result.confidence}% conf.</span>
            </div>
            <p className="mt-1 text-sm text-ink/70">{result.summary}</p>
            <ul className="mt-2 space-y-1">
              {result.rationale.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-ink/60">
                  <span className="text-brand-green">•</span> {r}
                </li>
              ))}
            </ul>
          </section>

          {/* Mock broker automation */}
          <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-deep">Automated execution</h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Simulation</span>
            </div>

            {broker === "idle" && (
              <button onClick={connect} className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink/15 py-2.5 text-sm font-semibold text-ink/80">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#387ED1] text-[10px] font-bold text-white">Z</span>
                Connect broker (demo)
              </button>
            )}
            {broker === "connecting" && <p className="py-2 text-center text-sm text-ink/50">Connecting to broker…</p>}
            {(broker === "connected" || broker === "automating" || broker === "done") && (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs text-brand-green">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-green text-[9px] text-white">✓</span>
                  Broker connected (demo account)
                </div>
                {broker === "connected" && (
                  <button onClick={automate} className="w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white">
                    ⚡ Automate this strategy
                  </button>
                )}
                {(broker === "automating" || broker === "done") && (
                  <div className="space-y-1.5">
                    {filled.map((o, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-brand-light/60 px-3 py-2 text-xs animate-fade-in">
                        <span className="font-medium text-ink">
                          <span className="mr-1 rounded bg-brand-green px-1.5 py-0.5 text-[9px] font-bold text-white">{o.side}</span>
                          {o.symbol}
                        </span>
                        <span className="text-ink/60">
                          {o.qty} @ ₹{o.price} · {inrCompact(o.value)}
                        </span>
                      </div>
                    ))}
                    {broker === "automating" && <p className="py-1 text-center text-xs text-ink/50">Placing orders…</p>}
                    {broker === "done" && (
                      <div className="mt-1 rounded-lg bg-brand-green/10 px-3 py-2 text-xs font-medium text-brand-green">
                        ✓ {filled.length} orders placed (simulated). Total deployed {inr(filled.reduce((s, o) => s + o.value, 0))}. No real trades executed.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          <button
            onClick={() =>
              onAskAdvisor(
                `Dhan Sarthi, the strategy engine suggested a "${result.strategy}" strategy for ₹${amount.toLocaleString("en-IN")} at ${risk} risk. Can you explain this in simple terms and whether it fits my profile?`,
              )
            }
            className="w-full rounded-xl border border-brand-green py-2.5 text-sm font-semibold text-brand-green"
          >
            Ask Dhan Sarthi to explain →
          </button>

          <p className="pb-2 text-center text-[10px] text-ink/40">
            Educational simulation. No real broker is connected and no real trades are placed.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface py-2">
      <p className="text-sm font-bold text-brand-deep">{value}</p>
      <p className="text-[10px] text-ink/50">{label}</p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink/70">{label}</span>
        <span className="font-semibold text-brand-deep">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-green" />
    </div>
  );
}
