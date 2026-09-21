"use client";

import { useState } from "react";
import type { AssetClass, Holding } from "@/lib/data/types";
import { inr, ASSET_LABELS } from "@/lib/format";
import { postAaJourney, type AaJourneyResponse } from "@/lib/client/api";

const ADDABLE: { value: AssetClass; label: string }[] = [
  { value: "equity", label: "Equity / Stocks" },
  { value: "mutual_fund", label: "Mutual Funds" },
  { value: "bonds", label: "Bonds" },
  { value: "gold", label: "Gold" },
  { value: "cash", label: "Cash equivalents" },
  { value: "fd", label: "Fixed Deposit" },
];

export function AccountsPanel({
  customerId,
  holdings,
  setHoldings,
  bankLinked,
  setBankLinked,
}: {
  customerId: string;
  holdings: Holding[];
  setHoldings: (h: Holding[]) => void;
  bankLinked: boolean;
  setBankLinked: (v: boolean) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [journey, setJourney] = useState<AaJourneyResponse | null>(null);
  const [aaError, setAaError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addClass, setAddClass] = useState<AssetClass>("gold");
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState(100000);

  /**
   * Run the real Account Aggregator consent journey against IDBI's FinPro
   * sandbox. This used to be a simulated bank login with a fake password box;
   * the actual consent flow (APIs 590 → 591 → 739) is more convincing and is
   * what a real AA integration does.
   */
  const connect = async () => {
    setConnecting(true);
    setAaError(null);
    try {
      const result = await postAaJourney(customerId);
      setJourney(result);
      if (result.status === "active") setBankLinked(true);
    } catch (e) {
      setAaError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
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
            Fetch your balances and transactions from IDBI Bank with your explicit consent, through the
            Account Aggregator network. Your credentials are never shared with us.
          </p>

          {!connecting && (
            <button
              onClick={connect}
              className="w-full rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white"
            >
              🔗 Give consent &amp; link account
            </button>
          )}

          {connecting && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-ink/60">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-green border-t-transparent" />
              Requesting consent from the Account Aggregator…
            </div>
          )}

          {aaError && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
              Could not complete the consent journey: {aaError}
            </div>
          )}

          {journey && <ConsentTrace journey={journey} />}
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green/10 text-sm">🏦</span>
              <h3 className="text-sm font-semibold text-brand-deep">Bank accounts</h3>
            </div>
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-medium text-brand-green">
              🔗 Consent active
            </span>
          </div>

          {journey?.kyc && (
            <div className="mb-3 rounded-xl border border-brand-light bg-surface p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
                Verified by the bank
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <Fact label="Account" value={journey.kyc.maskedAccountNumber} />
                <Fact label="IFSC" value={journey.kyc.ifsc} />
                <Fact label="PAN" value={journey.kyc.maskedPan} />
                <Fact label="Date of birth" value={journey.kyc.dob} />
                <Fact label="Branch" value={journey.kyc.branch} />
                <Fact label="Customer since" value={journey.kyc.accountOpenDate} />
                <Fact label="Nominee" value={journey.kyc.nomineeRegistered ? "Registered" : "Not registered"} />
                <Fact label="CKYC" value={journey.kyc.ckycCompliant ? "Compliant" : "Pending"} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {bankHoldings.map(({ h, i }) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{h.name}</p>
                  <p className="text-[10px] text-ink/45">
                    {h.assetClass === "fd" ? "Fixed Deposit" : "Bank account"} · IDBI Bank
                  </p>
                </div>
                <span className="text-sm font-semibold text-brand-deep">{inr(h.value)}</span>
              </div>
            ))}
          </div>

          {journey && <ConsentTrace journey={journey} />}
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

/**
 * The consent journey, step by step, labelled with IDBI's own API numbers.
 *
 * Showing this is deliberate: a bank evaluating the product needs to see
 * consent being requested and granted before data moves, not data simply
 * appearing. It doubles as proof the sandbox integration is real.
 */
function ConsentTrace({ journey }: { journey: AaJourneyResponse }) {
  const LABEL: Record<AaJourneyResponse["status"], string> = {
    active: "Consent active",
    pending: "Awaiting approval",
    failed: "Could not complete",
  };
  return (
    <div className="mt-3 rounded-xl border border-brand-light bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
          Account Aggregator consent
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            journey.status === "active"
              ? "bg-brand-green/10 text-brand-green"
              : journey.status === "pending"
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {LABEL[journey.status]}
        </span>
      </div>

      <ol className="space-y-1.5">
        {journey.steps.map((s) => (
          <li key={`${s.api}-${s.at}`} className="flex gap-2 text-[11px]">
            <span className={s.ok ? "text-brand-green" : "text-red-500"}>{s.ok ? "✓" : "✕"}</span>
            <span className="font-mono text-[10px] text-ink/40">API {s.api}</span>
            <span className="flex-1">
              <span className="font-medium text-ink">{s.label}</span>
              <span className="block text-ink/50">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {journey.consentId && (
        <p className="mt-2 border-t border-brand-light pt-2 font-mono text-[10px] text-ink/40">
          Consent {journey.consentId}
          {journey.transactions.length > 0 && ` · ${journey.transactions.length} transactions fetched`}
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p>
      <span className="text-ink/45">{label}: </span>
      <span className="font-medium text-ink">{value}</span>
    </p>
  );
}
