"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { NavBar, type Screen } from "@/components/NavBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Dashboard } from "@/components/Dashboard";
import { GoalPlanner } from "@/components/GoalPlanner";
import { StrategyStudio } from "@/components/StrategyStudio";
import { CompanyLens } from "@/components/CompanyLens";
import { fetchCustomers, fetchProfile } from "@/lib/client/api";
import type { Customer, CustomerSummary, Holding } from "@/lib/data/types";

/**
 * The app shell.
 *
 * Customer data is fetched, never imported. The bundled personas used to be
 * pulled straight into this client component, which meant the UI showed
 * synthetic figures even when the server was serving live IDBI data — the
 * screen and the API disagreed about who the customer was.
 */
export default function Home() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [source, setSource] = useState<"mock" | "idbi">("mock");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [screen, setScreen] = useState<Screen>("advisor");
  const [prefill, setPrefill] = useState<string | undefined>();

  // Portfolio the user can edit: bank-linked accounts plus added investments.
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [bankLinked, setBankLinked] = useState(false);

  // Roster, once.
  useEffect(() => {
    let live = true;
    fetchCustomers()
      .then((r) => {
        if (!live) return;
        setCustomers(r.customers);
        setSource(r.source);
        setCustomerId((id) => id || r.customers[0]?.id || "");
      })
      .catch((e) => live && setLoadError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, []);

  // Full 360° record whenever the chosen customer changes.
  useEffect(() => {
    if (!customerId) return;
    let live = true;
    setCustomer(null);
    setBankLinked(false);
    fetchProfile(customerId)
      .then((p) => {
        if (!live) return;
        setCustomer(p.customer);
        setHoldings(p.customer.holdings);
        setLoadError(null);
      })
      .catch((e) => live && setLoadError(String(e.message ?? e)));
    return () => {
      live = false;
    };
  }, [customerId]);

  const askAdvisor = useCallback((prompt: string) => {
    setPrefill(prompt);
    setScreen("advisor");
  }, []);

  const current = customers.find((c) => c.id === customerId);
  // Prefer the live record's name — it is the bank's, not the roster's.
  const displayName = customer?.name ?? current?.name ?? "";
  const firstName = displayName.split(" ")[0] || "there";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:items-start lg:gap-12 lg:p-10">
      {/* Pitch rail (hidden on small screens) */}
      <div className="hidden max-w-sm lg:block lg:pt-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-green">IDBI Innovate · Track 01</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-brand-deep">Dhan Sarthi</h1>
        <p className="mt-1 text-lg font-medium text-ink/70">Your avatar-based wealth guide</p>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Human-RM-quality advisory for <em>every</em> customer — an avatar that talks, listens in your language,
          and grounds every suggestion in your real portfolio and spending. Built by <strong>Team Flexi Masters</strong>.
        </p>

        {source === "idbi" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-green/40 bg-brand-green/10 px-3 py-1.5 text-xs font-semibold text-brand-green">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
            Live IDBI sandbox data
          </p>
        )}

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

        {loadError && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            Could not load customer data: {loadError}
          </div>
        )}

        {!customer ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink/50">Loading your 360° view…</div>
        ) : (
          <>
            {screen === "advisor" && (
              <ChatPanel
                customerId={customerId}
                customerName={displayName}
                holdings={holdings}
                prefill={prefill}
                onPrefillConsumed={() => setPrefill(undefined)}
              />
            )}
            {screen === "dashboard" && (
              <Dashboard
                customer={customer}
                holdings={holdings}
                setHoldings={setHoldings}
                bankLinked={bankLinked}
                setBankLinked={setBankLinked}
                onAskAdvisor={askAdvisor}
              />
            )}
            {screen === "planner" && <GoalPlanner customerId={customerId} onAskAdvisor={askAdvisor} />}
            {screen === "strategy" && <StrategyStudio onAskAdvisor={askAdvisor} />}
            {screen === "lens" && <CompanyLens onAskAdvisor={askAdvisor} />}
          </>
        )}

        <NavBar active={screen} onChange={setScreen} />
      </PhoneFrame>
    </main>
  );
}
