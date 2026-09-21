"use client";

import { motion } from "framer-motion";
import { Clock, Landmark, Receipt, Scissors, TrendingUp } from "lucide-react";
import type { TaxAction, TaxOptimization } from "@/lib/contracts/types";
import { AS_OF } from "@/lib/finance/tax-rules";
import { inr } from "@/lib/format";

/**
 * The tax panel.
 *
 * Every other number in this app is a projection. These are rupees that are
 * saved or not saved regardless of what any market does, which is why the
 * total goes at the top in the largest type on the screen — and why the
 * conditions come with it rather than in a footnote. A saving quoted without
 * its lock-in and its regime is not a saving, it is a sales line.
 */

const ICONS: Record<TaxAction["kind"], typeof Receipt> = {
  ltcg_harvest: TrendingUp,
  loss_harvest: Scissors,
  "80c_gap": Landmark,
  hold_for_ltcg: Clock,
};

const KIND_LABEL: Record<TaxAction["kind"], string> = {
  ltcg_harvest: "Harvest long-term gains",
  loss_harvest: "Book a loss to offset gains",
  "80c_gap": "Unused 80C headroom",
  hold_for_ltcg: "Wait, then sell",
};

export function TaxPanel({ tax }: { tax: TaxOptimization }) {
  if (!tax.actions.length) {
    return (
      <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
        <Header year={tax.financialYear} />
        <p className="text-sm leading-relaxed text-ink/65">
          Nothing to reclaim this year. That is a real answer, not an empty screen — there are no
          gains to harvest and no headroom going unused.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <Header year={tax.financialYear} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl bg-brand-deep px-4 py-3 text-white"
      >
        <p className="text-[11px] text-white/70">Available to you this year</p>
        <p className="text-3xl font-bold tracking-tight">{inr(tax.totalEstimatedSaving)}</p>
        <p className="mt-0.5 text-[11px] text-white/60">
          Not a forecast — none of this depends on the market doing anything.
        </p>
      </motion.div>

      <ul className="mt-3 space-y-2">
        {tax.actions.map((a, i) => {
          const Icon = ICONS[a.kind] ?? Receipt;
          return (
            <motion.li
              key={`${a.kind}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl border border-brand-light px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-brand-deep">{KIND_LABEL[a.kind]}</p>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-brand-green">
                      {inr(a.estimatedSaving)}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-ink/50">{a.instrument}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink/65">{a.detail}</p>
                  {a.daysToLongTerm !== undefined && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <Clock className="h-3 w-3" />
                      {a.daysToLongTerm} days to go
                    </p>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="LTCG exemption left" value={inr(tax.ltcgExemptionRemaining)} />
        <Stat label="80C headroom" value={inr(tax.section80cGap)} />
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-ink/45">
        {AS_OF}. Estimates, not tax advice — your own position and regime decide what you actually
        save. Anything involving a purchase goes through the same suitability checks as every other
        recommendation.
      </p>
    </section>
  );
}

function Header({ year }: { year: string }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
        <Receipt className="h-4 w-4" />
        Tax, {year}
      </h3>
      <p className="text-[11px] text-ink/55">Rupees saved with certainty, not returns forecast.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <p className="text-ink/55">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-brand-deep">{value}</p>
    </div>
  );
}
