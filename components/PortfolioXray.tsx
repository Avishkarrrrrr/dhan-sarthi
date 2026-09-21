"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { lookThrough } from "@/lib/finance/xray";
import { inrCompact } from "@/lib/format";
import type { Customer } from "@/lib/data/types";

/**
 * The look-through, on screen.
 *
 * A pie chart of asset classes tells a customer they own "mutual funds",
 * which is the one thing they already knew. This says which companies and
 * which sectors those funds actually bought on their behalf, how much of it
 * they bought twice, and — the part most such screens leave out — how much of
 * their money it could not see through at all.
 */
export function PortfolioXray({ customer }: { customer: Customer }) {
  const x = useMemo(() => lookThrough(customer), [customer]);
  const [open, setOpen] = useState(false);

  // Nothing to unwrap. For a term-deposit customer this is the true answer,
  // and saying it plainly is better than an empty chart.
  if (x.effectiveEquity <= 0) {
    return (
      <Shell>
        <p className="text-sm leading-relaxed text-ink/70">
          Everything you hold is in deposits, so there is nothing to look through — no companies, no
          sectors, no market risk. That is the finding: your money is safe and it is standing still.
        </p>
      </Shell>
    );
  }

  const drift = x.effectiveEquityPct - x.headlineEquityPct;
  const sectors = x.bySector.slice(0, 6);
  const top = x.bySector[0];

  return (
    <Shell>
      {/* Headline vs. real equity. The gap is the whole point of unwrapping. */}
      <div className="rounded-xl bg-brand-light/60 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-brand-deep/70">True equity exposure</span>
          <span className="text-lg font-bold tabular-nums text-brand-deep">{pct(x.effectiveEquityPct)}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/60">
          {Math.abs(drift) < 0.02 ? (
            <>Your labels and your holdings agree — {pct(x.headlineEquityPct)} of the book is growth assets.</>
          ) : drift < 0 ? (
            <>
              Labelled {pct(x.headlineEquityPct)}, but hybrid funds hold debt too, so you carry{" "}
              <b>{pct(-drift)} less</b> market risk than the labels suggest.
            </>
          ) : (
            <>
              Labelled {pct(x.headlineEquityPct)} — the wrappers hide{" "}
              <b>{pct(drift)} more</b> market risk than the labels suggest.
            </>
          )}
        </p>
      </div>

      {/* Sectors, as a share of the equity sleeve. */}
      <div className="mt-3 space-y-1.5">
        {sectors.map((s, i) => (
          <div key={s.sector} className="flex items-center gap-2">
            <span className="w-[42%] shrink-0 truncate text-[11px] text-ink/70" title={s.sector}>
              {s.sector}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-light">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (s.weight / (top?.weight || 1)) * 100)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                className="h-full rounded-full bg-brand-green"
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-brand-deep">
              {pct(s.weight)}
            </span>
          </div>
        ))}
        <p className="pt-0.5 text-[10px] text-ink/45">Share of your equity, not of net worth.</p>
      </div>

      {/* Overlap: the number a fund seller never volunteers. */}
      {x.overlapPct > 0.02 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">
            {pct(x.overlapPct)} of your equity is bought twice
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">
            That much is going into companies you already own through another fund. It is not
            diversifying you — it is the same bet with a second name on it.
          </p>
        </div>
      )}

      {/* Companies. */}
      {x.byStock.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-brand-deep/70">
            Companies you own, through everything
          </p>
          <ul className="space-y-1">
            {x.byStock.slice(0, open ? 12 : 5).map((s) => (
              <li key={s.name} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-ink/80">{s.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-deep">
                  {pct(s.weight)}
                </span>
              </li>
            ))}
          </ul>
          {x.byStock.length > 5 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 text-[11px] font-medium text-brand-green underline-offset-2 hover:underline"
            >
              {open ? "Show fewer" : `Show ${Math.min(7, x.byStock.length - 5)} more`}
            </button>
          )}
          <p className="mt-1 text-[10px] text-ink/45">Share of total net worth.</p>
        </div>
      )}

      {/* What it could not see. Stated, not buried. */}
      <div className="mt-3 border-t border-brand-light pt-2.5">
        <p className="text-[11px] leading-relaxed text-ink/55">
          Resolved <b className="text-ink/75">{pct(x.stockCoverage)}</b> of your equity to named
          companies
          {x.unclassifiedPct > 0.01 && (
            <>
              ; <b className="text-ink/75">{pct(x.unclassifiedPct)}</b> could not be looked through,
              so the sector figures above are a floor, not a ceiling
            </>
          )}
          .
        </p>
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-brand-green">
            How this was worked out
          </summary>
          <p className="mt-1 text-[10px] leading-relaxed text-ink/55">{x.source} As of {x.asOf}.</p>
          <ul className="mt-1.5 space-y-0.5">
            {x.vehicles.map((v) => (
              <li key={v.name} className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="truncate text-ink/70">{v.name}</span>
                <span className={`shrink-0 ${v.classified ? "text-ink/50" : "text-amber-700"}`}>
                  {v.category} · {inrCompact(v.equityValue)} equity
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <h3 className="text-sm font-semibold text-brand-deep">What you actually own</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-ink/55">
        Looking through every fund to the companies underneath.
      </p>
      {children}
    </section>
  );
}

function pct(w: number): string {
  return `${Math.round(w * 100)}%`;
}
