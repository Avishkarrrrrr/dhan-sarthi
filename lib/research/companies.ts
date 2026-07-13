/**
 * Bundled company documents for Company Lens. In production these would be the
 * latest concall transcript + investor presentation scraped from Screener.in
 * (see the team's concall_insights / financial_statement_analyzer repos). For a
 * self-contained, serverless-friendly demo we bundle representative excerpts of
 * real, recently-reported figures, plus a cached analysis used when no LLM key
 * is configured.
 */

export interface CompanyAnalysis {
  quarter: string; // Current-quarter results summary
  risks: string; // Key challenges & risks (short & long term)
  projections: string; // Future projections
  verdict: string; // Final verdict for a wealth decision
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  sector: string;
  latestPeriod: string;
  /** Representative excerpt of the latest concall + investor presentation. */
  document: string;
  /** Pre-generated analysis used as the no-key fallback. */
  cached: CompanyAnalysis;
}

const COMPANIES: Company[] = [
  {
    id: "tcs",
    name: "Tata Consultancy Services",
    ticker: "TCS",
    sector: "IT Services",
    latestPeriod: "Q4 FY25",
    document: `TCS Q4 FY25 earnings call & investor presentation highlights.
Revenue of ~₹64,500 cr, up ~4% YoY; full-year revenue crossed ₹2.55 lakh cr. Operating margin ~26%, management targeting a 26-28% band. Net income ~₹12,500 cr. Order book (TCV) strong at ~$13bn for the quarter; deal pipeline described as robust across BFSI and consumer. BFSI showed early signs of recovery; North America demand still cautious on discretionary spend. Headcount broadly stable; attrition moderated to ~13%. Management flagged GenAI as a growing part of the pipeline with several large transformation deals. Dividend: final dividend proposed, total payout ratio high. Commentary: "FY26 expected to be better than FY25" on demand normalisation, though macro uncertainty in the US remains a watch item.`,
    cached: {
      quarter:
        "Revenue ~₹64,500 cr (+~4% YoY), FY25 crossing ₹2.55 lakh cr. Operating margin healthy at ~26%. Quarterly deal wins (TCV) strong at ~$13bn, led by BFSI and consumer. Attrition eased to ~13%.",
      risks:
        "Short term: cautious discretionary IT spend in North America and US macro uncertainty. Long term: pricing pressure and the need to re-skill at scale for GenAI-led delivery, plus currency volatility.",
      projections:
        "Management guides FY26 to be better than FY25 on demand normalisation and BFSI recovery. Margin defended in a 26-28% band; GenAI transformation deals expected to scale in the pipeline.",
      verdict:
        "Quality large-cap compounder with strong cash generation and high dividend payout — suitable as a core, lower-volatility equity holding. Near-term upside hinges on US demand recovery; accumulate on dips rather than chase.",
    },
  },
  {
    id: "infy",
    name: "Infosys",
    ticker: "INFY",
    sector: "IT Services",
    latestPeriod: "Q4 FY25",
    document: `Infosys Q4 FY25 concall & presentation highlights.
Revenue ~₹40,900 cr; sequential growth soft on seasonal furloughs. FY26 revenue growth guidance of ~0-3% in constant currency; operating margin guidance ~20-22%. Large-deal TCV for the year ~$17bn with a healthy share net-new. Management highlighted momentum in AI (Topaz) and cost-efficiency deals. BFSI and manufacturing stable; retail and telecom soft. Capital allocation: buyback and dividends continued. Cautious tone on discretionary spend recovery timing.`,
    cached: {
      quarter:
        "Revenue ~₹40,900 cr with soft sequential growth on furloughs. Full-year large-deal TCV ~$17bn with a good net-new mix. Operating margin around the guided 20-22% band.",
      risks:
        "Short term: muted FY26 growth guidance (~0-3% cc) and soft retail/telecom verticals. Long term: margin defence amid wage pressure and pricing, and execution on AI-led (Topaz) transformation.",
      projections:
        "FY26 growth guided conservatively at ~0-3% cc; margin ~20-22%. AI and cost-takeout deals expected to anchor the pipeline; recovery skewed to H2.",
      verdict:
        "Solid franchise but a cautious near-term growth outlook. A reasonable core IT holding for diversification; better entered on weakness given the soft guidance. Watch deal conversion into revenue.",
    },
  },
  {
    id: "ril",
    name: "Reliance Industries",
    ticker: "RELIANCE",
    sector: "Conglomerate (Energy, Retail, Telecom)",
    latestPeriod: "Q4 FY25",
    document: `Reliance Industries Q4 FY25 earnings highlights.
Consolidated revenue ~₹2.6 lakh cr; consolidated EBITDA at a record with resilient contribution from Jio and Retail offsetting softer O2C on refining margins. Jio ARPU improving post-tariff hikes; subscriber base >480mn, 5G rollout monetisation underway. Retail revenue growth moderated but margins improved on operating leverage; store expansion continues. New energy (solar/giga-factories) capex ramping, expected to be a multi-year growth engine. Net debt broadly stable; management reiterated disciplined capital allocation.`,
    cached: {
      quarter:
        "Consolidated revenue ~₹2.6 lakh cr with record EBITDA. Jio (ARPU up post tariff hike, >480mn subs) and Retail (margin expansion) offset softer O2C refining margins.",
      risks:
        "Short term: O2C cyclicality and refining-margin swings; retail demand moderation. Long term: heavy new-energy capex execution risk and returns timeline; regulatory/telecom pricing dynamics.",
      projections:
        "Jio ARPU and 5G monetisation to drive digital; retail to compound on store expansion; new-energy to become a multi-year growth engine as giga-factories ramp.",
      verdict:
        "Diversified compounder with growth optionality in digital, retail and new energy. Suitable as a core large-cap; key monitorables are new-energy execution and O2C cycle. Stagger entries given size of capex bets.",
    },
  },
  {
    id: "hdfcbank",
    name: "HDFC Bank",
    ticker: "HDFCBANK",
    sector: "Private Sector Bank",
    latestPeriod: "Q4 FY25",
    document: `HDFC Bank Q4 FY25 concall highlights.
Net interest income growing double-digits; NIM ~3.4-3.6% with gradual improvement expected. Asset quality stable: gross NPA ~1.3%, healthy provision coverage. Post-merger focus on lowering the credit-deposit ratio and growing deposits faster than advances; deposit mobilisation a priority. Retail and commercial/rural banking driving advances. Management guided advances growth to moderate near term then re-accelerate, with deposit-led balance-sheet normalisation over FY26-27.`,
    cached: {
      quarter:
        "Double-digit NII growth, NIM ~3.4-3.6%, and stable asset quality (GNPA ~1.3%) with strong provision coverage. Clear focus on deposit growth to bring down the credit-deposit ratio post-merger.",
      risks:
        "Short term: elevated credit-deposit ratio and deposit-mobilisation intensity may cap near-term advances growth. Long term: NIM sensitivity to rate cycle and competition for deposits.",
      projections:
        "Advances growth to moderate then re-accelerate as deposits catch up (FY26-27 normalisation). NIM expected to improve gradually; asset quality guided stable.",
      verdict:
        "Best-in-class franchise with strong asset quality — a core holding for a long-term investor. Near-term returns gated by balance-sheet normalisation; attractive to accumulate for patient capital.",
    },
  },
];

export function listCompanies(): Omit<Company, "document" | "cached">[] {
  return COMPANIES.map(({ id, name, ticker, sector, latestPeriod }) => ({ id, name, ticker, sector, latestPeriod }));
}

export function getCompany(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}
