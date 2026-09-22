"use client";

import { AllocationChart } from "./charts/AllocationChart";
import { SpendingChart } from "./charts/SpendingChart";
import { PortfolioOptimizer } from "./PortfolioOptimizer";
import { AccountsPanel } from "./AccountsPanel";
import { PortfolioXray } from "./PortfolioXray";
import { StockPortfolio } from "./StockPortfolio";
import { SourceLinking } from "./SourceLinking";
import { inr, inrCompact } from "@/lib/format";
import {
  allocation,
  cashflow,
  computeNudges,
  monthlySurplus,
  netWorth,
  spendingInsights,
  type Cashflow,
  type Nudge,
} from "@/lib/finance/metrics";
import type { Customer, Holding } from "@/lib/data/types";

export function Dashboard({
  customer,
  holdings,
  setHoldings,
  bankLinked,
  setBankLinked,
  onAskAdvisor,
}: {
  customer: Customer;
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  bankLinked: boolean;
  setBankLinked: (v: boolean) => void;
  onAskAdvisor: (p: string) => void;
}) {
  // Live portfolio = base customer with the currently linked/added holdings.
  const live: Customer = { ...customer, holdings };
  const nw = netWorth(live);
  const alloc = allocation(live);
  const spends = spendingInsights(live);
  const flow = cashflow(live);
  const nudges = computeNudges(live);
  const surplus = monthlySurplus(live);

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4 pb-24">
      {/* Net worth header */}
      <div className="rounded-2xl bg-brand-deep p-4 text-white shadow-soft">
        <p className="text-xs text-white/70">Total net worth {bankLinked && <span className="text-brand-accent">· bank linked</span>}</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight">{inr(nw)}</p>
        {/*
          A negative number is a shortfall, not a surplus, and printing
          "surplus ₹-55.5k" in the accent colour reads as good news about a bad
          month. Name it for what it is and colour it accordingly.
        */}
        <p className="mt-1 text-xs text-white/70">
          {surplus >= 0 ? "Est. monthly surplus " : "Spending exceeds income by "}
          <span className={`font-semibold ${surplus >= 0 ? "text-brand-accent" : "text-amber-300"}`}>
            {inrCompact(Math.abs(surplus))}
          </span>
        </p>
      </div>

      <SourceLinking customerId={customer.id} />

      <AccountsPanel customerId={customer.id} holdings={holdings} setHoldings={setHoldings} bankLinked={bankLinked} setBankLinked={setBankLinked} />

      {alloc.length > 0 && (
        <Card title="Asset allocation">
          <AllocationChart data={alloc} />
        </Card>
      )}

      <StockPortfolio customer={live} />

      <PortfolioXray customer={live} />

      {/*
        A category chart needs categories. The live statement feed labels every
        row "S1 TXN 7", so charting it puts reference numbers on the axis and
        makes working software look broken. Money in, money out and the largest
        debits are genuinely in the data.
      */}
      {flow.categorised ? (
        <Card title="Where your money goes (monthly)">
          <SpendingChart data={spends} />
        </Card>
      ) : (
        flow.debitCount + flow.creditCount > 0 && (
          <Card title="Your month, from the bank statement">
            <CashflowSummary flow={flow} />
          </Card>
        )
      )}

      <Card title="Dhan Sarthi noticed">
        <ul className="space-y-2">
          {nudges.map((n) => (
            <NudgeRow key={n.id} n={n} />
          ))}
        </ul>
      </Card>

      <PortfolioOptimizer customer={live} onAskAdvisor={onAskAdvisor} />
    </div>
  );
}

/**
 * What an uncategorised statement can still say. No invented categories: the
 * totals and the largest debits are read straight off the rows.
 */
function CashflowSummary({ flow }: { flow: Cashflow }) {
  const net = flow.monthlyIn - flow.monthlyOut;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-brand-light/60 p-3">
          <p className="text-[11px] text-ink/60">Money in</p>
          <p className="text-lg font-bold tabular-nums text-brand-green">{inrCompact(flow.monthlyIn)}</p>
          <p className="text-[10px] text-ink/45">{flow.creditCount} credits</p>
        </div>
        <div className="rounded-xl bg-brand-light/60 p-3">
          <p className="text-[11px] text-ink/60">Money out</p>
          <p className="text-lg font-bold tabular-nums text-ink">{inrCompact(flow.monthlyOut)}</p>
          <p className="text-[10px] text-ink/45">{flow.debitCount} debits</p>
        </div>
      </div>
      <p className="text-xs text-ink/70">
        Net{" "}
        <span className={`font-semibold tabular-nums ${net >= 0 ? "text-brand-green" : "text-signal-down"}`}>
          {net >= 0 ? "+" : "−"}
          {inrCompact(Math.abs(net))}
        </span>{" "}
        a month across {flow.months === 1 ? "one month" : `${flow.months} months`} of statement.
      </p>

      {flow.largest.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-brand-deep/70">Largest debits</p>
          <ul className="space-y-1">
            {flow.largest.map((d, i) => (
              <li key={`${d.date}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink/60">{d.date}</span>
                <span className="font-semibold tabular-nums text-ink">{inr(d.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-ink/45">
        Your bank statement carries no merchant detail, so these rows cannot honestly be sorted into
        categories. Everything above is read straight off the statement.
      </p>
    </div>
  );
}

function NudgeRow({ n }: { n: Nudge }) {
  const color =
    n.severity === "warn" ? "bg-amber-100 text-amber-700" : n.severity === "good" ? "bg-brand-green/10 text-brand-green" : "bg-sky-100 text-sky-700";
  return (
    <li className="flex gap-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${color}`}>
        {n.severity === "warn" ? "!" : n.severity === "good" ? "✓" : "i"}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{n.title}</p>
        <p className="text-xs leading-relaxed text-ink/60">{n.detail}</p>
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <h3 className="mb-3 text-sm font-semibold text-brand-deep">{title}</h3>
      {children}
    </section>
  );
}
