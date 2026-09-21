import type { Customer, Holding } from "@/lib/data/types";

/**
 * Portfolio look-through.
 *
 * A customer does not own "mutual funds". They own, through those funds, a few
 * hundred companies — and usually the same twenty companies several times over.
 * Judging concentration on the class label is judging the wrapper instead of
 * the contents: two funds that are 60% the same stocks look like
 * diversification and are not.
 *
 * This module unwraps each growth holding into sector and stock exposure, so
 * the concentration rules in `lib/compliance/rules.ts` have something real to
 * act on. Before it existed `PortfolioXray.bySector` was always empty and the
 * sector rule was dead code that could never fire.
 *
 * ## What these numbers are, and what they are not
 *
 * The sandbox exposes bank accounts, not a holdings feed — there is no API
 * that returns what is inside a customer's fund. So the look-through runs on
 * **indicative category models** built from published index and category
 * weights, not on the specific fund's own portfolio. A Nifty 50 index fund is
 * modelled by the index; a flexi-cap fund by the category average.
 *
 * That is stated everywhere it surfaces, and the honesty is enforced by the
 * arithmetic rather than by a footnote:
 *
 *  - anything that cannot be matched to a model is counted as
 *    **unclassified**, never quietly spread across sectors;
 *  - unclassified exposure stays in the denominator, so an unknown holding
 *    *dilutes* every sector weight rather than inflating it — the look-through
 *    understates concentration when it is ignorant, which is the safe
 *    direction for a rule that can hold up advice;
 *  - `stockCoverage` says how much of the equity was actually resolved to
 *    named companies, so nobody mistakes a partial answer for a complete one.
 */

/** A modelled fund or stock basket. Weights are fractions of the equity part. */
export interface CategoryModel {
  label: string;
  /** How much of the vehicle is equity at all. A hybrid fund is not 100%. */
  equityShare: number;
  /** Sector split of the equity part. Sums to 1. */
  sectors: Record<string, number>;
  /** Named constituents of the equity part. Partial — the top holdings only. */
  stocks: Record<string, number>;
}

/** Provenance, shown wherever the look-through is displayed. */
export const MODEL_AS_OF = "June 2025";
export const MODEL_SOURCE =
  "Indicative category models from published NSE Nifty 50 index weights and AMFI category averages. Not a live holdings feed — the sandbox has no holdings API.";

const NIFTY_SECTORS: Record<string, number> = {
  "Financial Services": 0.37,
  "Information Technology": 0.11,
  "Oil & Gas": 0.09,
  FMCG: 0.08,
  Automobile: 0.08,
  Healthcare: 0.045,
  Telecom: 0.045,
  Construction: 0.04,
  "Metals & Mining": 0.035,
  "Power & Utilities": 0.03,
  "Consumer Services": 0.025,
  "Capital Goods": 0.02,
  Other: 0.03,
};

const NIFTY_STOCKS: Record<string, number> = {
  "HDFC Bank": 0.115,
  "Reliance Industries": 0.085,
  "ICICI Bank": 0.082,
  Infosys: 0.055,
  "Bharti Airtel": 0.044,
  "Tata Consultancy Services": 0.039,
  "Larsen & Toubro": 0.037,
  ITC: 0.035,
  "Axis Bank": 0.03,
  "Kotak Mahindra Bank": 0.027,
  "State Bank of India": 0.027,
  "Mahindra & Mahindra": 0.024,
  "Bajaj Finance": 0.022,
  "Hindustan Unilever": 0.021,
  "Sun Pharmaceutical": 0.019,
};

const FLEXICAP_SECTORS: Record<string, number> = {
  "Financial Services": 0.3,
  "Information Technology": 0.11,
  Healthcare: 0.08,
  Automobile: 0.08,
  "Capital Goods": 0.07,
  FMCG: 0.06,
  "Oil & Gas": 0.06,
  "Consumer Services": 0.05,
  Chemicals: 0.04,
  Telecom: 0.04,
  "Metals & Mining": 0.03,
  "Power & Utilities": 0.03,
  Other: 0.05,
};

const FLEXICAP_STOCKS: Record<string, number> = {
  "HDFC Bank": 0.07,
  "ICICI Bank": 0.06,
  "Reliance Industries": 0.045,
  Infosys: 0.04,
  "Axis Bank": 0.03,
  "Bharti Airtel": 0.028,
  "Larsen & Toubro": 0.025,
  "State Bank of India": 0.022,
  "Tata Consultancy Services": 0.02,
  "Bajaj Finance": 0.018,
};

const MIDCAP_SECTORS: Record<string, number> = {
  "Financial Services": 0.2,
  "Capital Goods": 0.14,
  Healthcare: 0.12,
  "Consumer Services": 0.09,
  Automobile: 0.08,
  "Information Technology": 0.07,
  Chemicals: 0.07,
  Realty: 0.05,
  "Metals & Mining": 0.05,
  "Power & Utilities": 0.04,
  FMCG: 0.04,
  Other: 0.05,
};

const SMALLCAP_SECTORS: Record<string, number> = {
  "Capital Goods": 0.16,
  "Financial Services": 0.13,
  Healthcare: 0.12,
  Chemicals: 0.1,
  "Consumer Services": 0.09,
  "Information Technology": 0.08,
  Automobile: 0.07,
  Realty: 0.06,
  "Metals & Mining": 0.05,
  Textiles: 0.04,
  "Power & Utilities": 0.04,
  Other: 0.06,
};

/**
 * The models. Mid and small cap carry no named stocks on purpose: the category
 * average is a fair description of their *sectors*, but naming individual
 * small caps would be inventing a portfolio the customer may not hold.
 */
export const CATEGORY_MODELS: Record<string, CategoryModel> = {
  index: { label: "Nifty 50 index", equityShare: 1, sectors: NIFTY_SECTORS, stocks: NIFTY_STOCKS },
  largecap: { label: "Large-cap equity", equityShare: 0.96, sectors: NIFTY_SECTORS, stocks: scale(NIFTY_STOCKS, 0.85) },
  flexicap: { label: "Flexi-cap equity", equityShare: 0.95, sectors: FLEXICAP_SECTORS, stocks: FLEXICAP_STOCKS },
  elss: { label: "ELSS (tax-saving equity)", equityShare: 0.95, sectors: FLEXICAP_SECTORS, stocks: FLEXICAP_STOCKS },
  midcap: { label: "Mid-cap equity", equityShare: 0.95, sectors: MIDCAP_SECTORS, stocks: {} },
  smallcap: { label: "Small-cap equity", equityShare: 0.93, sectors: SMALLCAP_SECTORS, stocks: {} },
  balanced: { label: "Balanced advantage (hybrid)", equityShare: 0.65, sectors: NIFTY_SECTORS, stocks: scale(NIFTY_STOCKS, 0.6) },
  aggressiveHybrid: { label: "Aggressive hybrid", equityShare: 0.72, sectors: FLEXICAP_SECTORS, stocks: scale(FLEXICAP_STOCKS, 0.7) },
  banking: {
    label: "Banking & financial services fund",
    equityShare: 0.97,
    sectors: { "Financial Services": 1 },
    stocks: {
      "HDFC Bank": 0.22,
      "ICICI Bank": 0.2,
      "Axis Bank": 0.09,
      "State Bank of India": 0.08,
      "Kotak Mahindra Bank": 0.07,
      "Bajaj Finance": 0.06,
    },
  },
  pharma: { label: "Healthcare / pharma fund", equityShare: 0.96, sectors: { Healthcare: 1 }, stocks: { "Sun Pharmaceutical": 0.12 } },
  technology: {
    label: "Technology fund",
    equityShare: 0.96,
    sectors: { "Information Technology": 1 },
    stocks: { Infosys: 0.18, "Tata Consultancy Services": 0.16 },
  },
  international: { label: "International equity", equityShare: 0.97, sectors: { "Global (non-India)": 1 }, stocks: {} },
  debt: { label: "Debt / liquid", equityShare: 0, sectors: {}, stocks: {} },
};

/**
 * Name → model. Order matters: the first match wins, so the specific patterns
 * ("balanced advantage", "small-cap") must sit above the generic ones, and the
 * debt patterns above everything, because "liquid fund" is a fund but holds no
 * equity at all.
 */
const MATCHERS: { re: RegExp; model: keyof typeof CATEGORY_MODELS }[] = [
  { re: /\b(liquid|debt|gilt|corporate bond|money market|overnight|ultra[- ]short|arbitrage)\b/i, model: "debt" },
  { re: /\b(balanced advantage|dynamic asset|baf)\b/i, model: "balanced" },
  { re: /\b(aggressive hybrid|hybrid|equity savings)\b/i, model: "aggressiveHybrid" },
  { re: /\b(nifty|sensex|index)\b/i, model: "index" },
  { re: /\b(elss|tax saver|tax-saver)\b/i, model: "elss" },
  { re: /\b(bank|banking|financial services|psu bank)\b/i, model: "banking" },
  { re: /\b(pharma|healthcare)\b/i, model: "pharma" },
  { re: /\b(technology|tech fund|digital)\b/i, model: "technology" },
  { re: /\b(international|global|us equity|nasdaq)\b/i, model: "international" },
  { re: /\b(small[- ]?cap)\b/i, model: "smallcap" },
  { re: /\b(mid[- ]?cap|mid & small|mid and small)\b/i, model: "midcap" },
  { re: /\b(flexi[- ]?cap|multi[- ]?cap|focused)\b/i, model: "flexicap" },
  { re: /\b(large[- ]?cap|blue[- ]?chip|bluechip|top 100)\b/i, model: "largecap" },
];

/** Sectors for companies a customer may hold directly, by name. */
const STOCK_SECTORS: Record<string, string> = {
  "HDFC Bank": "Financial Services",
  "ICICI Bank": "Financial Services",
  "Axis Bank": "Financial Services",
  "State Bank of India": "Financial Services",
  "Kotak Mahindra Bank": "Financial Services",
  "Bajaj Finance": "Financial Services",
  "IDBI Bank": "Financial Services",
  Infosys: "Information Technology",
  "Tata Consultancy Services": "Information Technology",
  Wipro: "Information Technology",
  "HCL Technologies": "Information Technology",
  "Reliance Industries": "Oil & Gas",
  ITC: "FMCG",
  "Hindustan Unilever": "FMCG",
  "Mahindra & Mahindra": "Automobile",
  "Maruti Suzuki": "Automobile",
  "Tata Motors": "Automobile",
  "Sun Pharmaceutical": "Healthcare",
  "Dr Reddy's Laboratories": "Healthcare",
  "Bharti Airtel": "Telecom",
  "Larsen & Toubro": "Construction",
  "Tata Steel": "Metals & Mining",
  "JSW Steel": "Metals & Mining",
  NTPC: "Power & Utilities",
  "Power Grid": "Power & Utilities",
  Adani: "Power & Utilities",
};

/** One holding, and what we could work out about it. */
export interface XrayVehicle {
  name: string;
  value: number;
  /** Model label, or "Not classified" when the name matched nothing. */
  category: string;
  /** How much of this holding is equity, INR. */
  equityValue: number;
  /** Equity resolved all the way to named companies, INR. */
  namedValue: number;
  classified: boolean;
}

export interface LookThrough {
  /** Named companies, as a fraction of **total portfolio**. Largest first. */
  byStock: { name: string; weight: number }[];
  /** Sectors, as a fraction of **equity exposure**. Largest first. */
  bySector: { sector: string; weight: number }[];
  /** Equity money buying a company already owned elsewhere, 0..1 of equity. */
  overlapPct: number;
  /** Equity exposure once hybrids are unwrapped, INR and as a fraction. */
  effectiveEquity: number;
  effectiveEquityPct: number;
  /** What the class labels claim: equity + mutual_fund, as a fraction. */
  headlineEquityPct: number;
  /** Equity we could not model, 0..1 of equity exposure. */
  unclassifiedPct: number;
  /** Equity resolved to named companies, 0..1 of equity exposure. */
  stockCoverage: number;
  vehicles: XrayVehicle[];
  asOf: string;
  source: string;
}

/** Growth wrappers are the only things worth unwrapping. */
const LOOKABLE = new Set(["equity", "mutual_fund"]);

/** Match a holding to a model. Exported so the UI can label a single holding. */
export function classify(holding: Holding): { key: string; model: CategoryModel } | undefined {
  const name = holding.name ?? "";

  // A directly held company resolves to itself — a one-stock "model".
  const stock = matchStock(name);
  if (stock && holding.assetClass === "equity") {
    return {
      key: "stock",
      model: {
        label: stock,
        equityShare: 1,
        sectors: { [STOCK_SECTORS[stock]]: 1 },
        stocks: { [stock]: 1 },
      },
    };
  }

  for (const m of MATCHERS) {
    if (m.re.test(name)) return { key: m.model as string, model: CATEGORY_MODELS[m.model] };
  }
  return undefined;
}

export function lookThrough(customer: Customer): LookThrough {
  const holdings = customer.holdings ?? [];
  const total = holdings.reduce((s, h) => s + (h.value || 0), 0);

  const sectorValue: Record<string, number> = {};
  const stockValue: Record<string, number> = {};
  /** Per-vehicle stock exposure, kept to measure genuine overlap. */
  const perVehicle: Record<string, number>[] = [];
  const vehicles: XrayVehicle[] = [];

  let effectiveEquity = 0;
  let unclassified = 0;
  let named = 0;
  let headlineEquity = 0;

  for (const h of holdings) {
    const value = h.value || 0;
    if (!LOOKABLE.has(h.assetClass) || value <= 0) continue;
    headlineEquity += value;

    const hit = classify(h);
    if (!hit) {
      /*
       * An unknown growth holding is assumed to be fully equity. Overstating
       * equity is the safe error for a suitability check — the opposite would
       * let an unrecognised fund quietly lower someone's measured risk.
       */
      effectiveEquity += value;
      unclassified += value;
      vehicles.push({
        name: h.name,
        value,
        category: "Not classified",
        equityValue: value,
        namedValue: 0,
        classified: false,
      });
      continue;
    }

    const { model } = hit;
    const equityValue = value * model.equityShare;
    effectiveEquity += equityValue;

    for (const [sector, w] of Object.entries(model.sectors)) {
      sectorValue[sector] = (sectorValue[sector] ?? 0) + equityValue * w;
    }

    const mine: Record<string, number> = {};
    let namedHere = 0;
    for (const [stock, w] of Object.entries(model.stocks)) {
      const v = equityValue * w;
      mine[stock] = v;
      stockValue[stock] = (stockValue[stock] ?? 0) + v;
      namedHere += v;
    }
    perVehicle.push(mine);
    named += namedHere;

    vehicles.push({
      name: h.name,
      value,
      category: model.label,
      equityValue,
      namedValue: namedHere,
      classified: true,
    });
  }

  const byStock = Object.entries(stockValue)
    .map(([name, v]) => ({ name, weight: round4(v / (total || 1)) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const bySector = Object.entries(sectorValue)
    .map(([sector, v]) => ({ sector, weight: round4(v / (effectiveEquity || 1)) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  return {
    byStock,
    bySector,
    overlapPct: round4(overlap(perVehicle) / (effectiveEquity || 1)),
    effectiveEquity: Math.round(effectiveEquity),
    effectiveEquityPct: round4(effectiveEquity / (total || 1)),
    headlineEquityPct: round4(headlineEquity / (total || 1)),
    unclassifiedPct: round4(unclassified / (effectiveEquity || 1)),
    stockCoverage: round4(named / (effectiveEquity || 1)),
    vehicles,
    asOf: MODEL_AS_OF,
    source: MODEL_SOURCE,
  };
}

/**
 * Duplicated exposure, in INR.
 *
 * For every company, all but the largest single-vehicle position is money
 * spent buying something already owned. Two funds that each put 7% into HDFC
 * Bank are not diversifying each other, and this is the number that says so.
 */
function overlap(perVehicle: Record<string, number>[]): number {
  const totals: Record<string, number> = {};
  const largest: Record<string, number> = {};
  for (const v of perVehicle) {
    for (const [stock, value] of Object.entries(v)) {
      totals[stock] = (totals[stock] ?? 0) + value;
      largest[stock] = Math.max(largest[stock] ?? 0, value);
    }
  }
  return Object.keys(totals).reduce((s, k) => s + (totals[k] - largest[k]), 0);
}

/** Exact-ish name match against the known companies. */
function matchStock(name: string): string | undefined {
  const n = name.toLowerCase();
  for (const stock of Object.keys(STOCK_SECTORS)) {
    if (n.includes(stock.toLowerCase())) return stock;
  }
  return undefined;
}

function scale(stocks: Record<string, number>, factor: number): Record<string, number> {
  return Object.fromEntries(Object.entries(stocks).map(([k, v]) => [k, v * factor]));
}

function round4(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : 0;
}
