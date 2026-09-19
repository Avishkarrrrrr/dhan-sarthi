import { NextResponse } from "next/server";
import { selectRepository } from "@/lib/data/select";

export const runtime = "nodejs";

/**
 * Customer roster for the persona switcher. Exists so the client no longer has
 * to import the customer dataset directly — a "use client" component cannot
 * reach RDS, and bundling the personas ships demo data to every browser.
 * /api/profile?id= returns the full 360° record for a chosen customer.
 */
export async function GET() {
  const repo = selectRepository();
  try {
    const customers = await repo.listCustomers();
    return NextResponse.json({ customers, source: repo.name });
  } catch (err) {
    // A misconfigured or unreachable RDS must not blank the persona switcher.
    // Fall back to the bundled personas so the demo degrades rather than dies,
    // matching how the LLM and voice layers behave.
    const { SyntheticRepository } = await import("@/lib/data/synthetic");
    const fallback = new SyntheticRepository();
    return NextResponse.json({
      customers: await fallback.listCustomers(),
      source: fallback.name,
      degraded: true,
      reason: String((err as Error)?.message ?? err),
    });
  }
}
