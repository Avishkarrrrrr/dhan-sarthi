import { NextResponse } from "next/server";
import { get } from "@/lib/audit/log";

export const runtime = "nodejs";

/** GET /api/audit/:id — the full traceable record behind one recommendation. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = get(id);
  if (!entry) return NextResponse.json({ error: "Unknown audit id" }, { status: 404 });
  return NextResponse.json(entry);
}
