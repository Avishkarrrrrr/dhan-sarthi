import { NextRequest, NextResponse } from "next/server";
import type { Allocation } from "@/lib/contracts/types";
import { decide } from "@/lib/hitl/queue";

export const runtime = "nodejs";

const DECISIONS = ["approved", "modified", "rejected"] as const;

/** POST /api/rm/decide — { ticketId, decision, decidedBy, modified?, note? } */
export async function POST(req: NextRequest) {
  let body: {
    ticketId?: string;
    decision?: string;
    decidedBy?: string;
    modified?: Allocation;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ticketId, decision, decidedBy, modified, note } = body;
  if (!ticketId) return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
  if (!decision || !DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
    return NextResponse.json(
      { error: `decision must be one of ${DECISIONS.join(", ")}` },
      { status: 400 },
    );
  }
  /*
   * Refuse an anonymous decision. The whole point of this gate is that a named
   * human is accountable; accepting a blank approver would produce an audit
   * record that proves nothing, which is worse than no record because it looks
   * like one.
   */
  if (!decidedBy?.trim()) {
    return NextResponse.json(
      { error: "decidedBy is required — a decision must carry the name of the person who made it" },
      { status: 400 },
    );
  }

  const ticket = decide(
    ticketId,
    decision as (typeof DECISIONS)[number],
    decidedBy.trim(),
    modified,
    note,
  );
  if (!ticket) return NextResponse.json({ error: "Unknown ticket" }, { status: 404 });
  return NextResponse.json(ticket);
}
