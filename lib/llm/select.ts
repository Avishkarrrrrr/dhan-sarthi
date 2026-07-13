import type { LlmProvider } from "./provider";
import { GeminiProvider } from "./gemini";
import { SarvamProvider } from "./sarvam";
import { FallbackProvider } from "./fallback";

/**
 * Choose a provider from env. Explicit LLM_PROVIDER wins; otherwise Gemini if a
 * key exists, then Sarvam, else the deterministic fallback. Constructing a
 * provider is cheap — the SDK client is only created inside complete().
 */
export function selectProvider(): LlmProvider {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase().trim();

  if (forced === "fallback") return new FallbackProvider();
  if (forced === "gemini") return new GeminiProvider();
  if (forced === "sarvam") return new SarvamProvider();

  if (process.env.GEMINI_API_KEY) return new GeminiProvider();
  if (process.env.SARVAM_API_KEY) return new SarvamProvider();
  return new FallbackProvider();
}
