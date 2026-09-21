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

  const [journey, customer] = await Promise.all([
    source.journey(customerId),
    source.getCustomer(customerId),
  ]);
  if (!journey) {
    return NextResponse.json(
      { error: "No Account Aggregator binding for this customer" },
      { status: 404 },
    );
  }

  const primary = journey.accounts[0];
  const kyc = toKyc(primary);
  return NextResponse.json({
    status: journey.status,
    steps: journey.steps,
    consentHandle: journey.consentHandle,
    consentId: journey.consentId,
    linkRefNumbers: journey.linkRefNumbers,
    // The AA returns the holder name as one unspaced run; core banking has it
    // as first/last. Prefer the readable one so the confirmation screen does
    // not greet the customer as "Priyapatil".
    kyc: kyc && { ...kyc, name: customer?.name || kyc.name },
    balance: balanceOf(journey.accounts),
    transactions: transactionsOf(journey.accounts),
    paymentModes: modeBreakdown(journey.accounts),
  });
}
