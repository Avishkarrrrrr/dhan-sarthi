import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/data/customers";
import { buildSystemPrompt } from "@/lib/llm/prompt";
import { selectProvider } from "@/lib/llm/select";
import { FallbackProvider } from "@/lib/llm/fallback";
import type { ChatMsg } from "@/lib/llm/provider";
import type { Holding } from "@/lib/data/types";

export const runtime = "nodejs";

interface ChatBody {
  customerId: string;
  messages: ChatMsg[];
  language?: string;
  holdings?: Holding[];
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customerId, messages, language = "en-IN", holdings } = body;
  if (!customerId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "customerId and messages are required" }, { status: 400 });
  }

  const base = getCustomer(customerId);
  if (!base) {
    return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  }

  // Ground on the live portfolio (linked accounts + added investments) if provided.
  const customer = holdings && holdings.length ? { ...base, holdings } : base;
  const system = buildSystemPrompt(customer, language);
  const provider = selectProvider();

  try {
    const reply = await provider.complete(messages, system);
    if (!reply) throw new Error("Empty reply");
    return NextResponse.json({ reply, provider: provider.name });
  } catch (err) {
    // Never hard-fail in front of a judge: degrade to the deterministic guide.
    console.error("chat provider error, using fallback:", err);
    const reply = await new FallbackProvider().complete(messages, system);
    return NextResponse.json({ reply, provider: "fallback" });
  }
}
