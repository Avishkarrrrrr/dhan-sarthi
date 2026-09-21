import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { selectSource } from "@/lib/integrations/source";
import { raiseRetentionAlert } from "@/lib/hitl/retention";
import { detectOutflows } from "@/lib/agents/retention";
import { classifyCounterparty } from "@/lib/finance/counterparty";

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

  const scanned: {
    customerId: string;
    attritionRisk: number;
    narrated: boolean;
    ticketId?: string;
  }[] = [];

  for (const id of ids) {
    const customer = await source.getCustomer(id);
    if (!customer) continue;
    const snapshot = buildSnapshot(customer);
    const ticket = raiseRetentionAlert(snapshot);
    scanned.push({
      customerId: id,
      attritionRisk: detectOutflows(snapshot).attritionRisk,
      /*
       * Whether this account's feed carries counterparty narration at all.
       * Without it a clean scan means nothing was visible, not that nothing is
       * happening — and an RM told "no risk found" would reasonably assume the
       * opposite.
       */
      narrated: (customer.transactions ?? []).some(
        (t) => classifyCounterparty(t.category).destination !== "unknown",
      ),
      ...(ticket ? { ticketId: ticket.id } : {}),
    });
  }

  const blind = scanned.filter((s) => !s.narrated).length;
  return NextResponse.json({
    scanned,
    raised: scanned.filter((s) => s.ticketId).length,
    unreadable: blind,
    summary:
      blind === scanned.length && blind > 0
        ? `Scanned ${scanned.length} customers. None of their statement feeds carry counterparty narration, so outflows cannot be attributed — this is an absence of evidence, not a clean bill of health.`
        : `Scanned ${scanned.length} customers; ${scanned.filter((s) => s.ticketId).length} raised${blind ? `, ${blind} unreadable for lack of narration` : ""}.`,
  });
}
