"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, CircleDashed, Loader2, Plus } from "lucide-react";
import type { AggregationResult, SourceStatus } from "@/lib/contracts/types";
import { sourceLabel } from "@/lib/aggregate";

/**
 * Where the money actually comes from, source by source.
 *
 * The number that matters here is completeness. IDBI's APIs cover accounts,
 * deposits and spending and nothing else — there is no holdings API in the
 * sandbox — so a customer who has only linked their bank is looking at half
 * their financial life. Showing "3 of 7" is both the honest answer and the
 * strongest argument for the Add button underneath it.
 *
 * The sources arrive one at a time on first render. That is a deliberate
 * piece of theatre over data that is already in hand, and it earns its place:
 * a list that simply exists tells a customer nothing about where it came from,
 * and where it came from is the whole trust argument.
 */
export function SourceLinking({
  customerId,
  onAdd,
}: {
  customerId: string;
  onAdd?: () => void;
}) {
  const [result, setResult] = useState<AggregationResult | null>(null);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    let live = true;
    setResult(null);
    setRevealed(0);
    fetch("/api/aggregate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    })
      .then((r) => r.json())
      .then((json) => live && !json.error && setResult(json))
      .catch(() => {
        /* the rest of the dashboard stands on its own */
      });
    return () => {
      live = false;
    };
  }, [customerId]);

  useEffect(() => {
    if (!result) return;
    const total = result.sources.length;
    const timer = setInterval(() => {
      setRevealed((n) => {
        if (n >= total) {
          clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, 220);
    return () => clearInterval(timer);
  }, [result]);

  if (!result) return null;

  const linked = result.sources.filter((s) => s.status === "linked").length;
  const pct = Math.round(result.completeness * 100);

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-brand-deep">Where this picture comes from</h3>
        <span className="text-[11px] font-semibold tabular-nums text-brand-deep">
          {linked} of {result.sources.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-brand-light">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full bg-brand-green"
        />
      </div>

      {/*
        Stocks, funds, bonds and gold are all missing for the same reason, so
        they all carry the same note. Printed against each of them it repeated
        verbatim four times and read like a template that had failed to fill.
        Say it once, against the first source it applies to.
      */}
      <ul className="space-y-1.5">
        {(() => {
          const said = new Set<string>();
          return result.sources.slice(0, revealed).map((s, i) => {
            const firstTime = !!s.note && !said.has(s.note);
            if (s.note) said.add(s.note);
            return <SourceRow key={s.kind} source={s} index={i} showNote={firstTime} />;
          });
        })()}
      </ul>

      {result.missing.length > 0 && onAdd && (
        <button
          onClick={onAdd}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-green/40 py-2 text-xs font-semibold text-brand-green hover:bg-brand-green/5"
        >
          <Plus className="h-3.5 w-3.5" />
          Complete the picture
        </button>
      )}
    </section>
  );
}

function SourceRow({
  source,
  index,
  showNote,
}: {
  source: SourceStatus;
  index: number;
  showNote: boolean;
}) {
  const linked = source.status === "linked";
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-start gap-2.5"
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          linked ? "bg-brand-green text-white" : "bg-ink/5 text-ink/35"
        }`}
      >
        {linked ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : source.status === "pending" ? (
          <Loader2 className="h-3 w-3" />
        ) : (
          <CircleDashed className="h-3 w-3" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-xs ${linked ? "font-medium text-ink" : "text-ink/50"}`}>
            {sourceLabel(source.kind)}
          </p>
          <span className="shrink-0 font-mono text-[10px] text-ink/40">{source.provider}</span>
        </div>
        {linked ? (
          <p className="text-[10px] text-ink/45">
            {source.itemCount}{" "}
            {source.kind === "spending"
              ? source.itemCount === 1
                ? "transaction"
                : "transactions"
              : source.itemCount === 1
                ? "holding"
                : "holdings"}
          </p>
        ) : (
          showNote && source.note && (
            <p className="text-[10px] leading-relaxed text-ink/45">{source.note}</p>
          )
        )}
      </div>
    </motion.li>
  );
}
