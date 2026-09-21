import { NextRequest, NextResponse } from "next/server";
import { toKyc, modeBreakdown, transactionsOf, balanceOf } from "@/lib/integrations/aa";
import { IdbiSource, selectSource } from "@/lib/integrations/source";

export const runtime = "nodejs";

/**
 * POST /api/aa — run the Account Aggregator consent journey for a customer.
 *
 * Returns the step-by-step trace (with IDBI's own API numbers), the identity
 * the consent unlocked, and the data fetched under it. The trace is the point:
 * it shows consent being asked for and granted, rather than data appearing
 * from nowhere.
 */
export async function POST(req: NextRequest) {
  let customerId = "priya";
  try {
    const body = await req.json();
    if (typeof body?.customerId === "string") customerId = body.customerId;
  } catch {
    // No body is fine — default customer.
  }

  const source = selectSource();
  if (!(source instanceof IdbiSource)) {
    return NextResponse.json(
      { error: "Account Aggregator requires the live IDBI source (set IDBI_LIVE=true)" },
      { status: 409 },
    );
  }

  const journey = await source.journey(customerId);
  if (!journey) {
    return NextResponse.json(
      { error: "No Account Aggregator binding for this customer" },
      { status: 404 },
    );
  }

  const primary = journey.accounts[0];
  return NextResponse.json({
    status: journey.status,
    steps: journey.steps,
    consentHandle: journey.consentHandle,
    consentId: journey.consentId,
    linkRefNumbers: journey.linkRefNumbers,
    kyc: toKyc(primary),
    balance: balanceOf(journey.accounts),
    transactions: transactionsOf(journey.accounts),
    paymentModes: modeBreakdown(journey.accounts),
  });
}
