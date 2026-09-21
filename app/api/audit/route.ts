import { NextRequest, NextResponse } from "next/server";
import { list } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * GET /api/audit?limit=50 — the recent decision trail.
 *
 * The per-id route answers "show me this recommendation"; this one answers
 * "show me what the system has been advising", which is the question a
 * supervisor or auditor actually opens with.
 */
export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 50;
  return NextResponse.json({ entries: list(limit) });
}
