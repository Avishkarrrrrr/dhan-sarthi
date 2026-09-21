import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { selectSource } from "@/lib/integrations/source";
import { raiseRetentionAlert } from "@/lib/hitl/retention";
import { detectOutflows } from "@/lib/agents/retention";

export const runtime = "nodejs";

/**
 * POST /api/rm/scan — { customerId? }
 *
 * Runs the deposit-flight radar. With no customerId it sweeps the whole roster,
 * which is how an RM would actually use it: not "tell me about this customer"
 * but "who is leaving".
 */
export async function POST(req: NextRequest) {
  let body: { customerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body means "scan everyone" */
  }

  const source = selectSource();
  const ids = body.customerId
    ? [body.customerId]
    : (await source.listCustomers()).map((c) => c.id);

  const scanned: { customerId: string; attritionRisk: number; ticketId?: string }[] = [];
  for (const id of ids) {
    const customer = await source.getCustomer(id);
    if (!customer) continue;
    const snapshot = buildSnapshot(customer);
    const ticket = raiseRetentionAlert(snapshot);
    scanned.push({
      customerId: id,
      attritionRisk: detectOutflows(snapshot).attritionRisk,
      ...(ticket ? { ticketId: ticket.id } : {}),
    });
  }

  return NextResponse.json({ scanned });
}
