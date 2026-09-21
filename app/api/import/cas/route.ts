import { NextRequest, NextResponse } from "next/server";
import { parseCas } from "@/lib/import/cas";

export const runtime = "nodejs";

/** A CAS is a few hundred KB. Anything much larger is not one. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/import/cas — multipart: `file` (the PDF), `password` (the PAN).
 *
 * The file is read into memory, parsed, and dropped. It is never written to
 * disk, never uploaded anywhere, and never logged — a CAS carries the
 * customer's PAN, address and entire portfolio, and the only safe place for it
 * is nowhere. Errors deliberately say nothing about the file's contents.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large to be a CAS" }, { status: 413 });
  }

  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await parseCas(data, password || undefined);
    return NextResponse.json(result);
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    /*
     * The one error worth distinguishing, because it is the one the customer
     * can fix: a wrong password. Everything else is reported as unreadable
     * rather than echoed back — a parser error can quote file contents, and
     * this file's contents are the customer's portfolio.
     */
    if (/password/i.test(message)) {
      return NextResponse.json(
        { error: "That password did not open the file. For an NSDL or CDSL statement it is your PAN, in capitals." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "This file could not be read. You can add your holdings by hand instead." },
      { status: 422 },
    );
  }
}
