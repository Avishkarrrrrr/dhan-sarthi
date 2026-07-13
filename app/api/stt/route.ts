import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "@/lib/voice/sarvam";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    const language = (form.get("language") as string) || "en-IN";
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }
    const result = await transcribe(file, language);
    return NextResponse.json(result);
  } catch (err) {
    console.error("STT error, signaling client fallback:", err);
    return NextResponse.json({ engine: "none" });
  }
}
