"use client";

import { useState } from "react";
import { listCompanies } from "@/lib/research/companies";
import { postResearch } from "@/lib/client/api";
import type { CompanyAnalysis } from "@/lib/research/companies";

export function CompanyLens({ onAskAdvisor }: { onAskAdvisor: (p: string) => void }) {
  const featured = listCompanies();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [source, setSource] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");

  const analyze = async (q?: string) => {
    const symbol = (q ?? query).trim();
    if (!symbol) return;
    setQuery(symbol);
    setLoading(true);
    setAnalysis(null);
    setError("");
    try {
      const res = await postResearch({ query: symbol });
      setAnalysis(res.analysis);
      setSource(res.source);
      setCompanyName(res.company);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't analyze. Please retry.");
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

  const sourceLabel =
    source === "cached" ? "Cached analysis" : source === "gemini" ? "Gemini 3.5" : source === "unavailable" ? "Needs AI key" : source;

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-bold text-brand-deep">Company Lens</h2>
        <p className="text-xs text-ink/55">AI insights from a company&apos;s latest concall & results.</p>
      </div>

      {/* Symbol input */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="NSE symbol or name — e.g. TCS, ITC"
          className="flex-1 rounded-xl border border-brand-light bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-green"
        />
        <button
          onClick={() => analyze()}
          disabled={loading || !query.trim()}
          className="rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? "…" : "Analyze"}
        </button>
      </div>

      {/* Featured quick-picks */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/45">Featured</p>
        <div className="flex flex-wrap gap-2">
          {featured.map((c) => (
            <button
              key={c.id}
              onClick={() => analyze(c.ticker)}
              className="rounded-full border border-brand-green/30 bg-white px-3 py-1.5 text-xs font-medium text-brand-green hover:bg-brand-green/5"
            >
              {c.ticker}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-2 text-center text-sm text-ink/50">Analyzing {query}…</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-red-600">{error}</p>}

      {analysis && !loading && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-deep">{companyName}</p>
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-medium text-brand-green">{sourceLabel}</span>
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
              onAskAdvisor(`I'm looking at ${companyName} for my portfolio. Based on its latest results, does it fit my risk profile and goals? Give me a simple take.`)
            }
            className="w-full rounded-xl border border-brand-green py-2.5 text-sm font-semibold text-brand-green"
          >
            Discuss with Dhan Sarthi →
          </button>

          <p className="pb-2 text-center text-[10px] text-ink/40">
            Educational analysis of publicly disclosed information. Not a buy/sell recommendation.
          </p>
        </>
      )}
    </div>
  );
}
