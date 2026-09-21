/**
 * Live prices for the equities a customer holds.
 *
 * A portfolio that does not move is a screenshot. This turns "Infosys, 40
 * shares" into a position with a current value, a P&L and a day change —
 * which is the difference between a mock and something that looks like the
 * customer's actual money.
 *
 * Source is Yahoo's chart endpoint, the same one the market module already
 * uses for the index. It is undocumented and unguaranteed, so every failure
 * path here degrades to "no live price" rather than to an error: a quote feed
 * being down must never blank a portfolio the bank's own data already proves
 * exists.
 */

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/** 30 seconds. Long enough to survive a page of tabs, short enough to tick. */
const TTL_MS = 30_000;

export interface Quote {
  symbol: string;
  ltp: number;
  prevClose: number;
  dayChangePct: number;
  at: number;
}

const cache = new Map<string, Quote>();

/** NSE symbols carry a `.NS` suffix on Yahoo. `M&M` needs encoding. */
function yahooSymbol(symbol: string): string {
  return `${encodeURIComponent(symbol.trim().toUpperCase())}.NS`;
}

async function fetchOne(symbol: string, signal?: AbortSignal): Promise<Quote | undefined> {
  try {
    const res = await fetch(`${BASE}/${yahooSymbol(symbol)}?range=1d&interval=1d`, {
      signal,
      // Yahoo 404s a plain fetch without a browser-ish agent often enough to
      // be worth setting; it costs nothing when it is not needed.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DhanSarthi/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const ltp = Number(meta?.regularMarketPrice);
    const prevClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(ltp) || ltp <= 0) return undefined;
    const prev = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : ltp;
    return {
      symbol: symbol.toUpperCase(),
      ltp,
      prevClose: prev,
      dayChangePct: Math.round(((ltp - prev) / prev) * 10000) / 100,
      at: Date.now(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Quotes for many symbols at once.
 *
 * Fetched in parallel and independently: one dead symbol must not cost the
 * other eleven their prices, which is what a single `Promise.all` over a
 * rejecting fetch would do.
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const now = Date.now();
  const out: Record<string, Quote> = {};
  const wanted: string[] = [];

  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) continue;
    const hit = cache.get(symbol);
    if (hit && now - hit.at < TTL_MS) out[symbol] = hit;
    else wanted.push(symbol);
  }

  const results = await Promise.allSettled(wanted.map((s) => fetchOne(s)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      cache.set(wanted[i], r.value);
      out[wanted[i]] = r.value;
    }
  });

  return out;
}

/** Test seam. */
export function clearQuoteCache(): void {
  cache.clear();
}
