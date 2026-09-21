import { NextRequest, NextResponse } from "next/server";
import { selectSource } from "@/lib/integrations/source";
import { firstQuestion, startSession } from "@/lib/discovery/machine";
import { save } from "@/lib/discovery/session";

export const runtime = "nodejs";

/** POST /api/discovery/start — { customerId, language? } */
export async function POST(req: NextRequest) {
  let body: { customerId?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const customer = await selectSource().getCustomer(body.customerId);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  const state = save(startSession(body.customerId, body.language ?? "en-IN"));
  const name = customer.name.split(" ")[0];
  return NextResponse.json({
    state,
    spokenText: `Hello ${name}. Before I suggest anything, I would like to understand what you are planning for. ${firstQuestion()}`,
    complete: false,
  });
}
