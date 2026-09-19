import { NextRequest, NextResponse } from "next/server";
import type { EscalationTicket } from "@/lib/contracts/types";
import { list } from "@/lib/hitl/queue";

export const runtime = "nodejs";

/** GET /api/rm/queue?status=pending — the relationship manager's inbox. */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as EscalationTicket["status"] | null;
  return NextResponse.json(list(status ?? undefined));
}
