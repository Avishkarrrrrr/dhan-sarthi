import { NextRequest, NextResponse } from "next/server";
import { getCompany, findCompanyByQuery, type CompanyAnalysis } from "@/lib/research/companies";
import { selectProvider } from "@/lib/llm/select";

export const runtime = "nodejs";

const JSON_SHAPE = `Return ONLY a JSON object with exactly these string keys, no markdown:
{
  "quarter": "Most recent quarter results summary (2-3 sentences, real figures where known; name the quarter, e.g. Q2 FY26).",
  "risks": "Key challenges & risks, short-term and long-term (2-3 sentences).",
  "projections": "Future projections and management guidance (2-3 sentences).",
  "verdict": "Final verdict for a retail wealth investor — core holding / accumulate / avoid, with the why (2-3 sentences)."
}
Be balanced and factual. No price target. If you are not confident about the company or its latest filing, say so plainly in each field rather than inventing figures.`;

const BUNDLED_SYSTEM = `You are an equity research analyst for a bank's wealth-advisory app. Analyze the provided company document (latest concall + investor presentation excerpts) for a retail investor making a wealth decision.\n\n${JSON_SHAPE}\nGround every point in the document.`;

const CUSTOM_SYSTEM = `You are an equity research analyst for a bank's wealth-advisory app. The user gives an NSE/BSE stock symbol or company name. Using the most recent quarterly results and earnings concall you are aware of, analyze it for a retail investor making a wealth decision.\n\n${JSON_SHAPE}`;

function tryParse(text: string): CompanyAnalysis | null {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const obj = JSON.parse(cleaned);
    if (obj.quarter && obj.risks && obj.projections && obj.verdict) return obj as CompanyAnalysis;
  } catch {
    /* ignore */
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { companyId?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider = selectProvider();

  // 1. Featured company by id, or a typed query that matches a bundled one.
  const bundled = body.companyId
    ? getCompany(body.companyId)
    : body.query
      ? findCompanyByQuery(body.query)
      : undefined;

  if (bundled) {
    if (provider.name === "fallback") {
      return NextResponse.json({ analysis: bundled.cached, source: "cached", company: bundled.name });
    }
    try {
      const text = await provider.complete(
        [{ role: "user", content: `Company: ${bundled.name} (${bundled.ticker}), ${bundled.latestPeriod}.\n\nDOCUMENT:\n${bundled.document}` }],
        BUNDLED_SYSTEM,
      );
      const parsed = tryParse(text);
      return NextResponse.json({ analysis: parsed ?? bundled.cached, source: parsed ? provider.name : "cached", company: bundled.name });
    } catch {
      return NextResponse.json({ analysis: bundled.cached, source: "cached", company: bundled.name });
    }
  }

  // 2. Free-text company the user typed (symbol/name) → live LLM analysis.
  const query = (body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "Provide a company symbol or name" }, { status: 400 });

  if (provider.name === "fallback") {
    return NextResponse.json({
      analysis: {
        quarter: `Live analysis for "${query}" needs an AI key.`,
        risks: "Add a GEMINI_API_KEY in .env to analyze any company on demand.",
        projections: "Meanwhile, try a featured company (TCS, Infosys, Reliance, HDFC Bank) — those work offline.",
        verdict: "No verdict available without the AI engine.",
      },
      source: "unavailable",
      company: query.toUpperCase(),
    });
  }

  try {
    const text = await provider.complete([{ role: "user", content: `Symbol/company: ${query}` }], CUSTOM_SYSTEM);
    const parsed = tryParse(text);
    if (parsed) return NextResponse.json({ analysis: parsed, source: provider.name, company: query.toUpperCase() });
    return NextResponse.json({ error: "Could not analyze that company. Try the exact symbol, e.g. TCS." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Analysis service unavailable. Please retry." }, { status: 502 });
  }
}
