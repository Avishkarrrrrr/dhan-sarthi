import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import type { Allocation, FinancialSnapshot } from "@/lib/contracts/types";
import { run } from "@/lib/compliance/pipeline";
import { selectSource } from "@/lib/integrations/source";

export const runtime = "nodejs";

/**
 * POST /api/compliance
 *
 * Body: { allocation, snapshot }        — vet a proposal against a given snapshot
 *    or { allocation, customerId }      — vet it against a live customer
 * Optionally: { spokenText, views, confidence }
 */
export async function POST(req: NextRequest) {
  let body: {
    allocation?: Allocation;
    snapshot?: FinancialSnapshot;
    customerId?: string;
    spokenText?: string;
    confidence?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { allocation, customerId, spokenText, confidence } = body;
  if (!allocation?.weights) {
    return NextResponse.json({ error: "allocation.weights is required" }, { status: 400 });
  }

  let snapshot = body.snapshot;
  if (!snapshot) {
    if (!customerId) {
      return NextResponse.json(
        { error: "Either snapshot or customerId is required" },
        { status: 400 },
      );
    }
    const customer = await selectSource().getCustomer(customerId);
    if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
    snapshot = buildSnapshot(customer);
  }

  const result = run({ allocation, snapshot, spokenText, confidence });
  return NextResponse.json({
    ...result.verdict,
    finalAllocation: result.finalAllocation,
    spokenText: result.spokenText,
    disclaimers: result.disclaimers,
    ticket: result.ticket,
    auditId: result.audit.auditId,
  });
}
