import type { ChatMsg, CompleteOpts, LlmProvider } from "./provider";

/** Sarvam-M chat completions — optional "fully-sovereign stack" LLM. */
export class SarvamProvider implements LlmProvider {
  name = "sarvam" as const;

  async complete(messages: ChatMsg[], system: string, opts: CompleteOpts = {}): Promise<string> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error("SARVAM_API_KEY not set");

    const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sarvam-m",
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.6,
        max_tokens: opts.maxTokens ?? 500,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Sarvam chat failed: ${res.status}`);
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content ?? "").trim();
  }
}
