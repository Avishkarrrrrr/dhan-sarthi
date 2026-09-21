/**
 * The instruments a customer can say they hold.
 *
 * Tier 1 of portfolio import (spec §6.4): type a name, pick the real
 * instrument. It ships first and cannot fail — no upload, no parser, no
 * third-party auth — which makes it the safety net behind every other tier.
 * A CAS upload is a lovely demo moment and a terrible single point of failure.
 *
 * The list is bundled rather than fetched. AMFI's NAVAll.txt and the NSE
 * symbol list are both large, occasionally slow and entirely outside our
 * control; a search box that hangs at a venue with bad wifi is worse than a
 * shorter list that always answers. Every name here is one the look-through in
 * `lib/finance/xray.ts` can classify, so a holding added on this screen is a
 * holding the compliance rules can actually see through.
 */

import type { AssetClass } from "@/lib/data/types";

export interface Instrument {
  /** NSE symbol for equities, a short code for funds. */
  symbol: string;
  name: string;
  assetClass: AssetClass;
  sector?: string;
  /** Funds are priced per unit by NAV; equities by last traded price. */
  kind: "equity" | "fund" | "other";
}

export const INSTRUMENTS: Instrument[] = [
  // ── Equities. Names match the look-through's sector table exactly. ──
  { symbol: "HDFCBANK", name: "HDFC Bank", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "ICICIBANK", name: "ICICI Bank", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "SBIN", name: "State Bank of India", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "AXISBANK", name: "Axis Bank", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "IDBI", name: "IDBI Bank", assetClass: "equity", sector: "Financial Services", kind: "equity" },
  { symbol: "INFY", name: "Infosys", assetClass: "equity", sector: "Information Technology", kind: "equity" },
  { symbol: "TCS", name: "Tata Consultancy Services", assetClass: "equity", sector: "Information Technology", kind: "equity" },
  { symbol: "WIPRO", name: "Wipro", assetClass: "equity", sector: "Information Technology", kind: "equity" },
  { symbol: "HCLTECH", name: "HCL Technologies", assetClass: "equity", sector: "Information Technology", kind: "equity" },
  { symbol: "RELIANCE", name: "Reliance Industries", assetClass: "equity", sector: "Oil & Gas", kind: "equity" },
  { symbol: "ITC", name: "ITC", assetClass: "equity", sector: "FMCG", kind: "equity" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", assetClass: "equity", sector: "FMCG", kind: "equity" },
  { symbol: "M&M", name: "Mahindra & Mahindra", assetClass: "equity", sector: "Automobile", kind: "equity" },
  { symbol: "MARUTI", name: "Maruti Suzuki", assetClass: "equity", sector: "Automobile", kind: "equity" },
  { symbol: "TATAMOTORS", name: "Tata Motors", assetClass: "equity", sector: "Automobile", kind: "equity" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", assetClass: "equity", sector: "Healthcare", kind: "equity" },
  { symbol: "DRREDDY", name: "Dr Reddy's Laboratories", assetClass: "equity", sector: "Healthcare", kind: "equity" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", assetClass: "equity", sector: "Telecom", kind: "equity" },
  { symbol: "LT", name: "Larsen & Toubro", assetClass: "equity", sector: "Construction", kind: "equity" },
  { symbol: "TATASTEEL", name: "Tata Steel", assetClass: "equity", sector: "Metals & Mining", kind: "equity" },
  { symbol: "JSWSTEEL", name: "JSW Steel", assetClass: "equity", sector: "Metals & Mining", kind: "equity" },
  { symbol: "NTPC", name: "NTPC", assetClass: "equity", sector: "Power & Utilities", kind: "equity" },
  { symbol: "POWERGRID", name: "Power Grid", assetClass: "equity", sector: "Power & Utilities", kind: "equity" },

  // ── Funds. Named by category, which is what the look-through models. ──
  { symbol: "NIFTY50IDX", name: "Nifty 50 Index Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "SENSEXIDX", name: "Sensex Index Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "FLEXICAP", name: "Flexi-cap Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "LARGECAP", name: "Large-cap Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "MIDCAP", name: "Mid-cap Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "SMALLCAP", name: "Small-cap Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "ELSS", name: "ELSS Tax Saver Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "BAF", name: "Balanced Advantage Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "BANKINGFUND", name: "Banking & Financial Services Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "PHARMAFUND", name: "Healthcare & Pharma Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "TECHFUND", name: "Technology Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "INTLFUND", name: "International Equity Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "LIQUIDFUND", name: "Liquid Fund", assetClass: "mutual_fund", kind: "fund" },
  { symbol: "CORPBOND", name: "Corporate Bond Fund", assetClass: "bonds", kind: "fund" },
  { symbol: "GILTFUND", name: "Gilt Fund", assetClass: "bonds", kind: "fund" },

  // ── Everything else a customer genuinely holds. ──
  { symbol: "SGB", name: "Sovereign Gold Bonds", assetClass: "gold", kind: "other" },
  { symbol: "GOLDETF", name: "Gold ETF", assetClass: "gold", kind: "other" },
  { symbol: "PHYSGOLD", name: "Physical gold", assetClass: "gold", kind: "other" },
  { symbol: "NCD", name: "Corporate NCD", assetClass: "bonds", kind: "other" },
  { symbol: "PPF", name: "Public Provident Fund", assetClass: "bonds", kind: "other" },
  { symbol: "EPF", name: "Employees' Provident Fund", assetClass: "bonds", kind: "other" },
];

/** Prefix and substring match on both symbol and name, best matches first. */
export function searchInstruments(query: string, limit = 8): Instrument[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = INSTRUMENTS.map((i) => {
    const sym = i.symbol.toLowerCase();
    const name = i.name.toLowerCase();
    let score = -1;
    if (sym === q || name === q) score = 0;
    else if (sym.startsWith(q) || name.startsWith(q)) score = 1;
    else if (name.includes(q) || sym.includes(q)) score = 2;
    return { i, score };
  })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.i.name.localeCompare(b.i.name));
  return scored.slice(0, limit).map((x) => x.i);
}

export function findInstrument(symbol: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.symbol.toLowerCase() === symbol.trim().toLowerCase());
}
