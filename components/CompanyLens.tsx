"use client";

import { useState } from "react";
import { listCompanies } from "@/lib/research/companies";
import { postResearch } from "@/lib/client/api";
import type { CompanyAnalysis } from "@/lib/research/companies";

export function CompanyLens({ onAskAdvisor }: { onAskAdvisor: (p: string) => void }) {
  const companies = listCompanies();
  const [selected, setSelected] = useState(companies[0].id);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState(false);

  const company = companies.find((c) => c.id === selected)!;

  const analyze = async () => {
    setLoading(true);
    setAnalysis(null);
    setError(false);
    try {
      const res = await postResearch(selected);
      setAnalysis(res.analysis);
      setSource(res.source);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const SECTIONS: { key: keyof CompanyAnalysis; label: string; icon: string; tone: string }[] = [
    { key: "quarter", label: "Quarter results", icon: "📊", tone: "bg-brand-green/10 text-brand-green" },
    { key: "risks", label: "Key risks & challenges", icon: "⚠️", tone: "bg-amber-100 text-amber-700" },
    { key: "projections", label: "Future projections", icon: "🔭", tone: "bg-sky-100 text-sky-700" },
    { key: "verdict", label: "Final verdict", icon: "✅", tone: "bg-brand-deep/10 text-brand-deep" },
  ];

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-bold text-brand-deep">Company Lens</h2>
        <p className="text-xs text-ink/55">AI insights from the latest concall & investor presentation.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelected(c.id);
              setAnalysis(null);
            }}
            className={`rounded-xl border p-3 text-left transition-colors ${
              selected === c.id ? "border-brand-green bg-brand-green/5" : "border-brand-light bg-white"
            }`}
          >
            <p className="text-sm font-semibold text-ink">{c.ticker}</p>
            <p className="text-[11px] leading-tight text-ink/55">{c.name}</p>
            <p className="mt-1 text-[10px] text-ink/40">{c.sector}</p>
          </button>
        ))}
      </div>

      <button
        onClick={analyze}
        disabled={loading}
        className="w-full rounded-xl bg-brand-green py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-50"
      >
        {loading ? `Analyzing ${company.ticker}…` : `Analyze ${company.ticker} — ${company.latestPeriod}`}
      </button>

      {error && <p className="text-center text-sm text-red-500">Couldn&apos;t analyze. Please retry.</p>}

      {analysis && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-deep">
              {company.name} · {company.latestPeriod}
            </p>
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-medium text-brand-green">
              {source === "cached" ? "Cached analysis" : source === "gemini" ? "Gemini 2.5" : source}
            </span>
          </div>
          {SECTIONS.map((s) => (
            <section key={s.key} className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${s.tone}`}>{s.icon}</span>
                <h3 className="text-sm font-semibold text-brand-deep">{s.label}</h3>
              </div>
              <p className="text-xs leading-relaxed text-ink/70">{analysis[s.key]}</p>
            </section>
          ))}

          <button
            onClick={() =>
              onAskAdvisor(
                `I'm looking at ${company.name} (${company.ticker}) for my portfolio. Based on its latest results, does it fit my risk profile and goals? Give me a simple take.`,
              )
            }
            className="w-full rounded-xl border border-brand-green py-2.5 text-sm font-semibold text-brand-green"
          >
            Discuss {company.ticker} with Dhan Sarthi →
          </button>

          <p className="pb-2 text-center text-[10px] text-ink/40">
            Educational analysis of publicly disclosed information. Not a buy/sell recommendation.
          </p>
        </>
      )}
    </div>
  );
}
