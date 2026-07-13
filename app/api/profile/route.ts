import { NextRequest, NextResponse } from "next/server";
import { buildProfileResponse } from "@/lib/finance/profile";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const profile = buildProfileResponse(id);
  if (!profile) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });

  return NextResponse.json(profile);
}
