import { NextRequest, NextResponse } from "next/server";
import { getCompany, type CompanyAnalysis } from "@/lib/research/companies";
import { selectProvider } from "@/lib/llm/select";

export const runtime = "nodejs";

const ANALYSIS_SYSTEM = `You are an equity research analyst for a bank's wealth-advisory app. Analyze the provided company document (latest concall + investor presentation excerpts) for a retail investor making a wealth decision.

Return ONLY a JSON object with exactly these string keys, no markdown:
{
  "quarter": "Current quarter results summary (2-3 sentences, use the real figures).",
  "risks": "Key challenges & risks, both short-term and long-term (2-3 sentences).",
  "projections": "Future projections and management guidance (2-3 sentences).",
  "verdict": "Final verdict for a retail wealth investor — is it a core holding, accumulate on dips, avoid, etc., with the why (2-3 sentences)."
}
Be balanced and factual. Do not give a price target. Ground every point in the document.`;

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
  let body: { companyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const company = getCompany(body.companyId ?? "");
  if (!company) return NextResponse.json({ error: "Unknown company" }, { status: 404 });

  const provider = selectProvider();
  if (provider.name === "fallback") {
    return NextResponse.json({ analysis: company.cached, source: "cached", company: company.name });
  }

  try {
    const text = await provider.complete(
      [{ role: "user", content: `Company: ${company.name} (${company.ticker}), ${company.latestPeriod}.\n\nDOCUMENT:\n${company.document}` }],
      ANALYSIS_SYSTEM,
    );
    const parsed = tryParse(text);
    if (parsed) return NextResponse.json({ analysis: parsed, source: provider.name, company: company.name });
    return NextResponse.json({ analysis: company.cached, source: "cached", company: company.name });
  } catch (err) {
    console.error("research provider error, using cached:", err);
    return NextResponse.json({ analysis: company.cached, source: "cached", company: company.name });
  }
}
