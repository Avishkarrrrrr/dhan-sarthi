import { NextRequest, NextResponse } from "next/server";
import { decide } from "@/lib/hitl/queue";

export const runtime = "nodejs";

const DECISIONS = ["approved", "modified", "rejected"] as const;

/** POST /api/rm/decide — { ticketId, decision, modified? } */
export async function POST(req: NextRequest) {
  let body: { ticketId?: string; decision?: string; modified?: Parameters<typeof decide>[2] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ticketId, decision, modified } = body;
  if (!ticketId) return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
  if (!decision || !DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
    return NextResponse.json(
      { error: `decision must be one of ${DECISIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const ticket = decide(ticketId, decision as (typeof DECISIONS)[number], modified);
  if (!ticket) return NextResponse.json({ error: "Unknown ticket" }, { status: 404 });
  return NextResponse.json(ticket);
}
