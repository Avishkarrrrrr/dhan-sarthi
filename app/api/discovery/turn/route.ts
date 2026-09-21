import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { selectSource } from "@/lib/integrations/source";
import { advance } from "@/lib/discovery/machine";
import { get, save } from "@/lib/discovery/session";

export const runtime = "nodejs";

/** POST /api/discovery/turn — { sessionId, transcript } */
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, transcript } = body;
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  if (typeof transcript !== "string") {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const state = get(sessionId);
  if (!state) return NextResponse.json({ error: "Unknown session" }, { status: 404 });

  const customer = await selectSource().getCustomer(state.customerId);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  const result = advance(state, transcript, buildSnapshot(customer));
  save(result.state);
  return NextResponse.json(result);
}
