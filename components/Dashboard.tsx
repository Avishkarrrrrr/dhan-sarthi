"use client";

import { AllocationChart } from "./charts/AllocationChart";
import { SpendingChart } from "./charts/SpendingChart";
import { PortfolioOptimizer } from "./PortfolioOptimizer";
import { AccountsPanel } from "./AccountsPanel";
import { inr, inrCompact } from "@/lib/format";
import {
  allocation,
  computeNudges,
  monthlySurplus,
  netWorth,
  spendingInsights,
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
  const nudges = computeNudges(live);
  const surplus = monthlySurplus(live);

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      {/* Net worth header */}
      <div className="rounded-2xl bg-brand-deep p-4 text-white shadow-soft">
        <p className="text-xs text-white/70">Total net worth {bankLinked && <span className="text-brand-accent">· bank linked</span>}</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight">{inr(nw)}</p>
        <p className="mt-1 text-xs text-white/70">
          Est. monthly surplus <span className="font-semibold text-brand-accent">{inrCompact(surplus)}</span>
        </p>
      </div>

      <AccountsPanel holdings={holdings} setHoldings={setHoldings} bankLinked={bankLinked} setBankLinked={setBankLinked} />

      {alloc.length > 0 && (
        <Card title="Asset allocation">
          <AllocationChart data={alloc} />
        </Card>
      )}

      <Card title="Where your money goes (monthly)">
        <SpendingChart data={spends} />
      </Card>

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
