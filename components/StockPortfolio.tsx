"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Customer, Holding } from "@/lib/data/types";
import { fetchQuotes } from "@/lib/client/api";
import { inr, inrCompact } from "@/lib/format";

/**
 * The stock book, priced live.
 *
 * A holdings list that never moves is a screenshot. This is the screen a
 * customer already recognises from every broker app they use, and getting it
 * right matters for a reason beyond looking real: it is the only place the
 * difference between what they paid and what it is worth is visible, and that
 * difference is what the tax desk is reasoning about two screens away.
 *
 * Prices are best-effort. When the quote feed is unreachable the table still
 * renders every position at its cost basis and says the prices are stale,
 * because a portfolio the bank's own data proves exists must not vanish
 * because Yahoo is down.
 */

interface Row {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  ltp?: number;
  dayChangePct?: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
}

type SortKey = "name" | "currentValue" | "pnlPct" | "dayChangePct";

/** Cost basis per unit, from the lots we have. Falls back to current value. */
function costPerUnit(h: Holding): number {
  const lots = h.lots ?? [];
  const units = lots.reduce((s, l) => s + l.quantity, 0);
  if (units > 0) return lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0) / units;
  return h.quantity ? h.value / h.quantity : 0;
}

export function StockPortfolio({ customer }: { customer: Customer }) {
  const positions = useMemo(
    () =>
      (customer.holdings ?? []).filter(
        (h) => h.assetClass === "equity" && h.symbol && (h.quantity ?? 0) > 0,
      ),
    [customer.holdings],
  );

  const [quotes, setQuotes] = useState<Record<string, { ltp: number; dayChangePct: number }>>({});
  const [checked, setChecked] = useState(false);
  const [sort, setSort] = useState<SortKey>("currentValue");

  const symbols = useMemo(() => positions.map((p) => p.symbol!).join(","), [positions]);

  useEffect(() => {
    if (!symbols) return;
    let live = true;
    fetchQuotes(symbols.split(","))
      .then((q) => live && setQuotes(q))
      .catch(() => {
        /* stale prices, not a blank table */
      })
      .finally(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [symbols]);

  if (!positions.length) return null;

  const rows: Row[] = positions.map((h) => {
    const quantity = h.quantity!;
    const avgPrice = costPerUnit(h);
    const q = quotes[h.symbol!.toUpperCase()];
    const ltp = q?.ltp;
    const invested = quantity * avgPrice;
    const currentValue = ltp ? quantity * ltp : h.value;
    const pnl = currentValue - invested;
    return {
      symbol: h.symbol!,
      name: h.name,
      quantity,
      avgPrice,
      ltp,
      dayChangePct: q?.dayChangePct,
      invested,
      currentValue,
      pnl,
      pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
    };
  });

  const sorted = [...rows].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : (b[sort] ?? 0) - (a[sort] ?? 0),
  );

  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const value = rows.reduce((s, r) => s + r.currentValue, 0);
  const pnl = value - invested;
  const live = Object.keys(quotes).length > 0;

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-brand-deep">Your stocks</h3>
          <p className="text-[11px] text-ink/55">
            {live ? "Priced live from NSE." : checked ? "Live prices unavailable — showing cost." : "Fetching prices…"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-brand-deep">{inr(value)}</p>
          <p className={`text-[11px] font-semibold tabular-nums ${pnl >= 0 ? "text-brand-green" : "text-signal-down"}`}>
            {pnl >= 0 ? "+" : "−"}
            {inrCompact(Math.abs(pnl))}
            {invested > 0 && ` (${pnl >= 0 ? "+" : "−"}${Math.abs((pnl / invested) * 100).toFixed(1)}%)`}
          </p>
        </div>
      </div>

      {/* Sort controls. A table this narrow is easier to re-order than to scroll. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(
          [
            ["currentValue", "Value"],
            ["pnlPct", "Return"],
            ["dayChangePct", "Today"],
            ["name", "Name"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
              sort === key ? "bg-brand-green text-white" : "bg-surface text-ink/55"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-[11px]">
          <thead className="text-ink/45">
            <tr>
              <th className="pb-1 font-medium">Stock</th>
              <th className="pb-1 text-right font-medium">LTP</th>
              <th className="pb-1 text-right font-medium">Value</th>
              <th className="pb-1 text-right font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.symbol} className="border-t border-brand-light/70">
                <td className="py-1.5 pr-2">
                  <p className="truncate font-medium text-ink">{r.name}</p>
                  <p className="text-[10px] text-ink/45">
                    {r.quantity} × {inr(r.avgPrice)}
                  </p>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.ltp ? (
                    <>
                      <p className="text-ink">{inr(r.ltp)}</p>
                      {r.dayChangePct !== undefined && (
                        <p
                          className={`flex items-center justify-end gap-0.5 text-[10px] ${
                            r.dayChangePct >= 0 ? "text-brand-green" : "text-signal-down"
                          }`}
                        >
                          {r.dayChangePct >= 0 ? (
                            <ArrowUp className="h-2.5 w-2.5" />
                          ) : (
                            <ArrowDown className="h-2.5 w-2.5" />
                          )}
                          {Math.abs(r.dayChangePct).toFixed(2)}%
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-ink/30">—</span>
                  )}
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums text-ink">
                  {inrCompact(r.currentValue)}
                </td>
                <td
                  className={`py-1.5 text-right font-semibold tabular-nums ${
                    r.pnl >= 0 ? "text-brand-green" : "text-signal-down"
                  }`}
                >
                  <p>
                    {r.pnl >= 0 ? "+" : "−"}
                    {inrCompact(Math.abs(r.pnl))}
                  </p>
                  <p className="text-[10px] font-normal">
                    {r.pnl >= 0 ? "+" : "−"}
                    {Math.abs(r.pnlPct).toFixed(1)}%
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
