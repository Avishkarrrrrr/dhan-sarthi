import { NextRequest, NextResponse } from "next/server";
import { recordCustomerDecision } from "@/lib/audit/log";

export const runtime = "nodejs";

const DECISIONS = ["approved", "declined"] as const;

/**
 * POST /api/action/decide — { auditId, decision }
 *
 * The customer's own approve/decline on their Action Card. This is the gate
 * that protects *their consent*, which is a different thing from the RM gate
 * that protects the *bank's* accountability for having recommended it. Both
 * decisions land on the same audit entry.
 */
export async function POST(req: NextRequest) {
  let body: { auditId?: string; decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { auditId, decision } = body;
  if (!auditId) return NextResponse.json({ error: "auditId is required" }, { status: 400 });
  if (!decision || !DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
    return NextResponse.json(
      { error: `decision must be one of ${DECISIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const entry = recordCustomerDecision(auditId, decision as (typeof DECISIONS)[number]);
  if (!entry) return NextResponse.json({ error: "Unknown audit entry" }, { status: 404 });
  return NextResponse.json(entry);
}
