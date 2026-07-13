import { NextRequest, NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market/nifty";
import { predictStrategy, type RiskTolerance } from "@/lib/strategy/engine";

export const runtime = "nodejs";

interface StrategyBody {
  investmentAmount: number;
  riskTolerance: RiskTolerance;
  expectedCagr: number;
  investmentHorizon: number;
}

export async function POST(req: NextRequest) {
  let body: StrategyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { investmentAmount, riskTolerance, expectedCagr, investmentHorizon } = body;
  if (
    typeof investmentAmount !== "number" ||
    !["Low", "Medium", "High"].includes(riskTolerance) ||
    typeof expectedCagr !== "number" ||
    typeof investmentHorizon !== "number"
  ) {
    return NextResponse.json({ error: "Invalid strategy inputs" }, { status: 400 });
  }

  const market = await getMarketSnapshot();
  const result = predictStrategy({ investmentAmount, riskTolerance, expectedCagr, investmentHorizon }, market);
  return NextResponse.json({ market, result });
}
