import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/data/customers";
import { projectGoal, goalVerdict, retirementProjection } from "@/lib/finance/simulate";

export const runtime = "nodejs";

interface SimulateBody {
  mode: "goal" | "retirement";
  customerId: string;
  goalId?: string;
  monthlyContribution: number;
  annualReturnPct: number;
  // retirement-only
  currentCorpus?: number;
  years?: number;
}

export async function POST(req: NextRequest) {
  let body: SimulateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { mode, customerId, monthlyContribution, annualReturnPct } = body;
  if (!mode || typeof monthlyContribution !== "number" || typeof annualReturnPct !== "number") {
    return NextResponse.json({ error: "mode, monthlyContribution, annualReturnPct required" }, { status: 400 });
  }

  const customer = getCustomer(customerId);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  if (mode === "goal") {
    const goal = customer.goals.find((g) => g.id === body.goalId);
    if (!goal) return NextResponse.json({ error: "Unknown goal" }, { status: 404 });
    const rows = projectGoal(goal, monthlyContribution, annualReturnPct);
    const verdict = goalVerdict(goal, monthlyContribution, annualReturnPct);
    return NextResponse.json({ goal, rows, verdict });
  }

  // retirement
  const years = body.years ?? Math.max(1, 60 - customer.age);
  const currentCorpus = body.currentCorpus ?? 0;
  const rows = Array.from({ length: years + 1 }, (_, y) => ({
    year: 2026 + y,
    value: retirementProjection(currentCorpus, monthlyContribution, y, annualReturnPct),
  }));
  const projected = rows[rows.length - 1].value;
  return NextResponse.json({ rows, projected, years });
}
