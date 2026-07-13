export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface LlmProvider {
  name: "gemini" | "sarvam" | "fallback";
  complete(messages: ChatMsg[], system: string): Promise<string>;
}
