import { NextRequest, NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { runCommittee } from "@/lib/agents/committee";
import { selectSource } from "@/lib/integrations/source";

export const runtime = "nodejs";

/**
 * POST /api/committee — { customerId, query? }
 *
 * Streams newline-delimited `CommitteeEvent` objects. NDJSON rather than SSE
 * because the client only needs to read lines, and a dropped connection should
 * leave no server state to clean up.
 */
export async function POST(req: NextRequest) {
  let body: { customerId?: string; query?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is fine; fall through to the default customer.
  }

  const customerId = body.customerId || "priya";
  const customer = await selectSource().getCustomer(customerId);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  const snapshot = buildSnapshot(customer);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runCommittee({ snapshot, query: body.query })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        // Surface the failure in-band: a half-finished committee on screen is
        // more useful than a stream that simply stops.
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message: String((err as Error)?.message ?? err) })}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
