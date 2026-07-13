import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/data/customers";
import { optimizePortfolio } from "@/lib/finance/mpt";
import { netWorth } from "@/lib/finance/metrics";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { customerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const customer = getCustomer(body.customerId ?? "");
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  const result = optimizePortfolio(customer);
  return NextResponse.json({ result, netWorth: netWorth(customer) });
}
