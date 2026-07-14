export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface CompleteOpts {
  /** Force JSON output (Gemini responseMimeType). */
  json?: boolean;
  /** Max output tokens for this call. */
  maxTokens?: number;
}

export interface LlmProvider {
  name: "gemini" | "sarvam" | "fallback";
  complete(messages: ChatMsg[], system: string, opts?: CompleteOpts): Promise<string>;
}
