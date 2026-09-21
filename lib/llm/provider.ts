export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface CompleteOpts {
  /** Force JSON output (Gemini responseMimeType). */
  json?: boolean;
  /** Max output tokens for this call. */
  maxTokens?: number;
}

export interface LlmProvider {
  name: "bedrock" | "gemini" | "sarvam" | "fallback";
  complete(messages: ChatMsg[], system: string, opts?: CompleteOpts): Promise<string>;
  /**
   * Token-by-token output, where the provider supports it.
   *
   * Optional on purpose: a provider that cannot stream should not have to
   * fake it, and the route falls back to `complete()` and emits one chunk.
   * A simulated typewriter over an already-complete answer would be a lie
   * about where the latency actually is.
   */
  stream?(messages: ChatMsg[], system: string, opts?: CompleteOpts): AsyncIterable<string>;
}
