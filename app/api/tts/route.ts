import { NextRequest, NextResponse } from "next/server";
import { synthesize } from "@/lib/voice/sarvam";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { text?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const language = body.language ?? "en-IN";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  try {
    const result = await synthesize(text, language);
    return NextResponse.json(result);
  } catch (err) {
    console.error("TTS error, signaling client fallback:", err);
    return NextResponse.json({ engine: "none" });
  }
}
