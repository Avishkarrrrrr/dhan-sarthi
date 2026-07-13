/**
 * Live Nifty market snapshot — the technical features the strategy model uses.
 * Fetches from Yahoo Finance server-side and computes EMA flags / RSI, with a
 * deterministic synthetic fallback so the demo works offline.
 */

export interface MarketSnapshot {
  nifty: number;
  above9Ema: boolean;
  above21Ema: boolean;
  above55Ema: boolean;
  above100Ema: boolean;
  rsi: number;
  indiaVix: number;
  trend: "bullish" | "bearish" | "neutral";
  live: boolean;
}

function ema(values: number[], span: number): number {
  const k = 2 / (span + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi14(values: number[]): number {
  const period = 14;
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function classify(closes: number[], vix: number): MarketSnapshot {
  const price = closes[closes.length - 1];
  const e9 = ema(closes.slice(-40), 9);
  const e21 = ema(closes.slice(-80), 21);
  const e55 = ema(closes, 55);
  const e100 = ema(closes, 100);
  const rsi = rsi14(closes);
  const above9 = price > e9;
  const above21 = price > e21;
  const above55 = price > e55;
  const above100 = price > e100;
  const bullCount = [above9, above21, above55, above100].filter(Boolean).length;
  const trend = bullCount >= 3 ? "bullish" : bullCount <= 1 ? "bearish" : "neutral";
  return {
    nifty: Math.round(price),
    above9Ema: above9,
    above21Ema: above21,
    above55Ema: above55,
    above100Ema: above100,
    rsi,
    indiaVix: Math.round(vix * 100) / 100,
    trend,
    live: false,
  };
}

/** Deterministic synthetic snapshot (used if the live fetch fails). */
export function syntheticSnapshot(): MarketSnapshot {
  // A plausible mildly-bullish market.
  const base = 24800;
  const closes = Array.from({ length: 120 }, (_, i) => base * (0.9 + 0.001 * i) + Math.sin(i / 5) * 120);
  const snap = classify(closes, 13.4);
  return { ...snap, live: false };
}

async function fetchCloses(symbol: string, signal: AbortSignal): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=8mo&interval=1d`;
  const res = await fetch(url, { signal, headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`chart ${res.status}`);
  const data = await res.json();
  const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const clean = closes.filter((c): c is number => typeof c === "number");
  if (clean.length < 100) throw new Error("insufficient data");
  return clean;
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const closes = await fetchCloses("^NSEI", controller.signal);
    let vix = 13.5;
    try {
      const vixCloses = await fetchCloses("^INDIAVIX", controller.signal);
      vix = vixCloses[vixCloses.length - 1];
    } catch {
      /* keep default vix */
    }
    const snap = classify(closes, vix);
    return { ...snap, live: true };
  } catch {
    return syntheticSnapshot();
  } finally {
    clearTimeout(timer);
  }
}
