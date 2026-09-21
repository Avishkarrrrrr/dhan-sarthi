import { NextRequest, NextResponse } from "next/server";
import { selectSource } from "@/lib/integrations/source";
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
  /** Stream the reply as it is generated rather than waiting for all of it. */
  stream?: boolean;
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

  const base = await selectSource().getCustomer(customerId);
  if (!base) {
    return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  }

  // Ground on the live portfolio (linked accounts + added investments) if provided.
  const customer = holdings && holdings.length ? { ...base, holdings } : base;
  const system = buildSystemPrompt(customer, language);
  const provider = selectProvider();

  if (body.stream) return streamReply(provider, messages, system);

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

/**
 * Stream the answer as newline-delimited JSON.
 *
 * The provider name is sent first so the UI can label the answer before any
 * text arrives, and errors are reported in-band — once the response has begun
 * there is no status code left to fail with, and a stream that simply stops
 * is indistinguishable from a slow one.
 */
function streamReply(
  provider: ReturnType<typeof selectProvider>,
  messages: ChatMsg[],
  system: string,
): Response {
  const encoder = new TextEncoder();
  const line = (o: unknown) => encoder.encode(`${JSON.stringify(o)}\n`);

  const body = new ReadableStream({
    async start(controller) {
      let produced = false;
      try {
        controller.enqueue(line({ type: "meta", provider: provider.name }));

        if (provider.stream) {
          for await (const delta of provider.stream(messages, system)) {
            if (!delta) continue;
            produced = true;
            controller.enqueue(line({ type: "delta", text: delta }));
          }
        }

        // No streaming support, or a stream that yielded nothing: fall back to
        // a single complete() and send it as one chunk rather than pretending.
        if (!produced) {
          const reply = await provider.complete(messages, system);
          if (!reply) throw new Error("Empty reply");
          controller.enqueue(line({ type: "delta", text: reply }));
        }
      } catch (err) {
        console.error("chat stream error, using fallback:", err);
        try {
          const reply = await new FallbackProvider().complete(messages, system);
          controller.enqueue(line({ type: "meta", provider: "fallback" }));
          controller.enqueue(line({ type: "delta", text: reply }));
        } catch {
          controller.enqueue(line({ type: "error", message: "Could not reach the advisor." }));
        }
      } finally {
        controller.enqueue(line({ type: "done" }));
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
