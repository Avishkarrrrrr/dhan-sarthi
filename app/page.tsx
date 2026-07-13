"use client";

import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { NavBar, type Screen } from "@/components/NavBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Dashboard } from "@/components/Dashboard";
import { GoalPlanner } from "@/components/GoalPlanner";
import { StrategyStudio } from "@/components/StrategyStudio";
import { CompanyLens } from "@/components/CompanyLens";
import { listCustomers } from "@/lib/data/customers";

export default function Home() {
  const customers = listCustomers();
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [screen, setScreen] = useState<Screen>("advisor");
  const [prefill, setPrefill] = useState<string | undefined>();

  const current = customers.find((c) => c.id === customerId)!;
  const firstName = current.name.split(" ")[0];

  const askAdvisor = (prompt: string) => {
    setPrefill(prompt);
    setScreen("advisor");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:items-start lg:gap-12 lg:p-10">
      {/* Pitch rail (hidden on small screens) */}
      <div className="hidden max-w-sm lg:block lg:pt-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-green">IDBI Innovate · Track 01</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-brand-deep">
          Dhan Sarthi
        </h1>
        <p className="mt-1 text-lg font-medium text-ink/70">Your avatar-based wealth guide</p>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Human-RM-quality advisory for <em>every</em> customer — an avatar that talks, listens in your language,
          and grounds every suggestion in your real portfolio and spending. Built by <strong>Team Flexi Masters</strong>.
        </p>
        <div className="mt-6 rounded-2xl border border-brand-light bg-white/70 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Try a customer</p>
          <div className="space-y-2">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => setCustomerId(c.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  c.id === customerId ? "border-brand-green bg-brand-green/5" : "border-brand-light bg-white"
                }`}
              >
                <span className="font-semibold text-ink">{c.name}</span>
                <span className="block text-xs text-ink/55">{c.persona}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <PhoneFrame>
        {/* App header */}
        <header className="flex items-center justify-between bg-brand-deep px-4 pb-3 pt-8 text-white">
          <div>
            <p className="text-[11px] text-white/60">Good day,</p>
            <p className="text-base font-semibold leading-tight">{firstName}</p>
          </div>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs text-white outline-none"
            aria-label="Switch demo customer"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id} className="text-ink">
                {c.name}
              </option>
            ))}
          </select>
        </header>

        {/* Active screen */}
        {screen === "advisor" && (
          <ChatPanel
            customerId={customerId}
            customerName={current.name}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(undefined)}
          />
        )}
        {screen === "dashboard" && <Dashboard customerId={customerId} onAskAdvisor={askAdvisor} />}
        {screen === "planner" && <GoalPlanner customerId={customerId} onAskAdvisor={askAdvisor} />}
        {screen === "strategy" && <StrategyStudio onAskAdvisor={askAdvisor} />}
        {screen === "lens" && <CompanyLens onAskAdvisor={askAdvisor} />}

        <NavBar active={screen} onChange={setScreen} />
      </PhoneFrame>
    </main>
  );
}
