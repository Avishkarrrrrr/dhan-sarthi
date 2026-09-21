import { NextRequest, NextResponse } from "next/server";
import { aggregate } from "@/lib/aggregate";
import { selectSource } from "@/lib/integrations/source";

export const runtime = "nodejs";

/** POST /api/aggregate — { customerId } → AggregationResult */
export async function POST(req: NextRequest) {
  let body: { customerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fall through to the default customer */
  }

  const source = selectSource();
  const customerId = body.customerId || "priya";
  const customer = await source.getCustomer(customerId);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  return NextResponse.json(aggregate(customer, source.name === "idbi"));
}
