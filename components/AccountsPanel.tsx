"use client";

import { useState } from "react";
import type { AssetClass, Holding } from "@/lib/data/types";
import { inr, ASSET_LABELS } from "@/lib/format";

const BANKS = ["HDFC Bank", "State Bank of India", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank"];

const ADDABLE: { value: AssetClass; label: string }[] = [
  { value: "equity", label: "Equity / Stocks" },
  { value: "mutual_fund", label: "Mutual Funds" },
  { value: "bonds", label: "Bonds" },
  { value: "gold", label: "Gold" },
  { value: "cash", label: "Cash equivalents" },
  { value: "fd", label: "Fixed Deposit" },
];

export function AccountsPanel({
  holdings,
  setHoldings,
  bankLinked,
  setBankLinked,
}: {
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  bankLinked: boolean;
  setBankLinked: (v: boolean) => void;
}) {
  const [showLogin, setShowLogin] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [bank, setBank] = useState(BANKS[0]);
  const [username, setUsername] = useState("demo_user");
  const [password, setPassword] = useState("demo1234");

  const [addOpen, setAddOpen] = useState(false);
  const [addClass, setAddClass] = useState<AssetClass>("gold");
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState(100000);

  const connect = () => {
    setConnecting(true);
    setShowLogin(false);
    setTimeout(() => {
      // Simulate the bank API returning a current-account balance we didn't have.
      if (!holdings.some((h) => h.name.toLowerCase().includes("current account"))) {
        setHoldings([...holdings, { assetClass: "cash", name: "Current account", value: 45000 }]);
      }
      setBankLinked(true);
      setConnecting(false);
    }, 1700);
  };

  const addInvestment = () => {
    const name = addName.trim() || ASSET_LABELS[addClass];
    setHoldings([...holdings, { assetClass: addClass, name, value: Math.max(0, addAmount) }]);
    setAddName("");
    setAddAmount(100000);
    setAddOpen(false);
  };

  const remove = (idx: number) => setHoldings(holdings.filter((_, i) => i !== idx));

  const bankHoldings = holdings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.assetClass === "cash" || h.assetClass === "fd");
  const investmentHoldings = holdings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.assetClass !== "cash" && h.assetClass !== "fd");

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      {/* Bank linking */}
      {!bankLinked ? (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green/10 text-sm">🏦</span>
            <h3 className="text-sm font-semibold text-brand-deep">Link your bank account</h3>
          </div>
          <p className="mb-3 text-xs text-ink/60">
            Securely fetch your savings, current account & deposit balances via Account Aggregator.
          </p>

          {!showLogin && !connecting && (
            <button onClick={() => setShowLogin(true)} className="w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white">
              🔗 Link bank account
            </button>
          )}

          {connecting && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-ink/60">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
              Securely fetching balances via Account Aggregator…
            </div>
          )}

          {showLogin && (
            <div className="space-y-2.5 animate-fade-in">
              <select value={bank} onChange={(e) => setBank(e.target.value)} className="w-full rounded-xl border border-brand-light bg-surface px-3 py-2 text-sm">
                {BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Customer ID / Username" className="w-full rounded-xl border border-brand-light bg-surface px-3 py-2 text-sm" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full rounded-xl border border-brand-light bg-surface px-3 py-2 text-sm" />
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                🔒 Simulation only. This is a mock login for the prototype — please don&apos;t enter real bank credentials. Nothing is sent anywhere.
              </div>
              <button onClick={connect} className="w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white">
                Securely connect →
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green/10 text-sm">🏦</span>
              <h3 className="text-sm font-semibold text-brand-deep">Bank accounts</h3>
            </div>
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-medium text-brand-green">🔗 Synced · just now</span>
          </div>
          <div className="space-y-1.5">
            {bankHoldings.map(({ h, i }) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{h.name}</p>
                  <p className="text-[10px] text-ink/45">{h.assetClass === "fd" ? "Fixed Deposit" : "Bank account"} · {bank}</p>
                </div>
                <span className="text-sm font-semibold text-brand-deep">{inr(h.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Investments & other assets */}
      <div className="mt-4 border-t border-brand-light pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-deep">Investments & other assets</h3>
          <button onClick={() => setAddOpen((v) => !v)} className="rounded-full bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
            {addOpen ? "Close" : "+ Add"}
          </button>
        </div>

        {addOpen && (
          <div className="mb-3 space-y-2 rounded-xl bg-surface p-3 animate-fade-in">
            <select value={addClass} onChange={(e) => setAddClass(e.target.value as AssetClass)} className="w-full rounded-lg border border-brand-light bg-white px-3 py-2 text-sm">
              {ADDABLE.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name (e.g. Sovereign Gold Bond)" className="w-full rounded-lg border border-brand-light bg-white px-3 py-2 text-sm" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink/60">₹</span>
              <input value={addAmount} onChange={(e) => setAddAmount(Number(e.target.value) || 0)} type="number" min={0} step={5000} className="flex-1 rounded-lg border border-brand-light bg-white px-3 py-2 text-sm" />
            </div>
            <button onClick={addInvestment} className="w-full rounded-lg bg-brand-green py-2 text-sm font-semibold text-white">
              Add to portfolio
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {investmentHoldings.length === 0 && <p className="py-2 text-center text-xs text-ink/40">No investments yet — add gold, bonds, equity and more.</p>}
          {investmentHoldings.map(({ h, i }) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink">{h.name}</p>
                <p className="text-[10px] text-ink/45">{ASSET_LABELS[h.assetClass]}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-brand-deep">{inr(h.value)}</span>
                <button onClick={() => remove(i)} aria-label="Remove" className="flex h-6 w-6 items-center justify-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-red-500">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
