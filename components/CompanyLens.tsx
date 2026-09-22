"use client";

import { useMemo, useState } from "react";
import { BarChart3, Gavel, Telescope, TriangleAlert, type LucideIcon } from "lucide-react";
import { listCompanies } from "@/lib/research/companies";
import { postResearch } from "@/lib/client/api";
import { lookThrough } from "@/lib/finance/xray";
import type { CompanyAnalysis } from "@/lib/research/companies";
import type { Customer } from "@/lib/data/types";

export function CompanyLens({
  customer,
  onAskAdvisor,
}: {
  customer: Customer | null;
  onAskAdvisor: (p: string) => void;
}) {
  const featured = listCompanies();

  /*
   * The companies the customer already owns, through their funds. Research is
   * far more useful pointed at something they hold than at a list of tickers
   * chosen by us — and it is the look-through that knows which those are.
   */
  const owned = useMemo(
    () => (customer ? lookThrough(customer).byStock.slice(0, 6) : []),
    [customer],
  );
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

  const SECTIONS: { key: keyof CompanyAnalysis; label: string; Icon: LucideIcon; tone: string }[] = [
    { key: "quarter", label: "Quarter results", Icon: BarChart3, tone: "bg-brand-green/10 text-brand-green" },
    { key: "risks", label: "Key risks & challenges", Icon: TriangleAlert, tone: "bg-amber-100 text-amber-700" },
    { key: "projections", label: "Future projections", Icon: Telescope, tone: "bg-sky-100 text-sky-700" },
    { key: "verdict", label: "Final verdict", Icon: Gavel, tone: "bg-brand-deep/10 text-brand-deep" },
  ];

  /*
   * Name the engine that actually answered. This used to print the raw
   * provider key, so the deployed build — which runs Claude on Bedrock under
   * IDBI's own AWS account — badged its analysis "bedrock" in lowercase.
   */
  const SOURCE_LABELS: Record<string, string> = {
    cached: "Bundled analysis",
    bedrock: "Claude on AWS Bedrock",
    sarvam: "Sarvam AI",
    unavailable: "AI engine unavailable",
    fallback: "Offline analysis",
  };
  const sourceLabel = SOURCE_LABELS[source] ?? source;

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4 pb-24">
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
          placeholder="Search a company or NSE symbol"
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

      {owned.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/45">
            In your portfolio
          </p>
          <div className="flex flex-wrap gap-2">
            {owned.map((c) => (
              <button
                key={c.name}
                onClick={() => analyze(c.name)}
                className="rounded-full border border-brand-green/30 bg-brand-green/5 px-3 py-1.5 text-xs font-medium text-brand-green hover:bg-brand-green/10"
              >
                {c.name}
                <span className="ml-1.5 tabular-nums text-brand-green/60">
                  {Math.round(c.weight * 100)}%
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink/45">
            Held through your funds — share of net worth.
          </p>
        </div>
      )}

      {/* Featured quick-picks */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-ink/45">Popular with investors</p>
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

      {/*
        Before anything is analysed this screen was 600px of empty white. Say
        what the tool does and what it will not do, which is also where the
        "not a recommendation" line belongs — before the analysis, not only
        after it.
      */}
      {!analysis && !loading && !error && (
        <section className="rounded-2xl border border-dashed border-brand-light bg-white/60 p-4">
          <h3 className="text-sm font-semibold text-brand-deep">What this does</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink/65">
            <li>· Reads the company&apos;s latest results and earnings call.</li>
            <li>· Summarises the quarter, the risks, and what management has guided to.</li>
            <li>· Ends with a plain verdict for a long-term investor — core holding, accumulate, or avoid.</li>
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-ink/45">
            Educational analysis of publicly disclosed information. No price targets, and never a
            buy or sell instruction — pick a company above to start.
          </p>
        </section>
      )}

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
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${s.tone}`}>
                  <s.Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </span>
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
