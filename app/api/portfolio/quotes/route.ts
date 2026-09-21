import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/market/quotes";

export const runtime = "nodejs";

/**
 * POST /api/portfolio/quotes — { symbols: string[] }
 *
 * Server-side on purpose: the quote source is one of the two external domains
 * declared to IDBI, and keeping the call here means the browser never reaches
 * outside the bank's perimeter.
 */
export async function POST(req: NextRequest) {
  let body: { symbols?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbols = Array.isArray(body.symbols)
    ? body.symbols.filter((s): s is string => typeof s === "string").slice(0, 30)
    : [];
  if (!symbols.length) return NextResponse.json({ quotes: {} });

  const quotes = await getQuotes(symbols);
  return NextResponse.json({ quotes, live: Object.keys(quotes).length > 0 });
}
