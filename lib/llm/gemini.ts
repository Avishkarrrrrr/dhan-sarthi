import { GoogleGenAI } from "@google/genai";
import type { ChatMsg, CompleteOpts, LlmProvider } from "./provider";

const PRIMARY = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

export class GeminiProvider implements LlmProvider {
  name = "gemini" as const;

  async complete(messages: ChatMsg[], system: string, opts: CompleteOpts = {}): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    const ai = new GoogleGenAI({ apiKey });

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const call = (model: string) =>
      ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: system,
          temperature: 0.6,
          maxOutputTokens: opts.maxTokens ?? 500,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });

    try {
      const res = await call(PRIMARY);
      return (res.text ?? "").trim();
    } catch (err: unknown) {
      // On rate limit / transient error, retry once on the lighter model.
      const msg = String((err as Error)?.message ?? err);
      if (/429|quota|rate|overload|503/i.test(msg)) {
        const res = await call(FALLBACK_MODEL);
        return (res.text ?? "").trim();
      }
      throw err;
    }
  }
}
