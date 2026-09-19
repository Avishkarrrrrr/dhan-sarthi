import type { LlmProvider } from "./provider";
import { BedrockProvider } from "./bedrock";
import { GeminiProvider } from "./gemini";
import { SarvamProvider } from "./sarvam";
import { FallbackProvider } from "./fallback";

/**
 * Choose a provider from env. Explicit LLM_PROVIDER wins; otherwise Bedrock if
 * it has been opted into, then Gemini if a key exists, then Sarvam, else the
 * deterministic fallback. Constructing a provider is cheap — the SDK client is
 * only created inside complete().
 *
 * Bedrock takes no API key (it uses the AWS credential chain), so it is opted
 * into with BEDROCK_MODEL_ID rather than sniffed from AWS_REGION — that would
 * hijack selection on any EC2 or Lambda host, where AWS_REGION is always set.
 */
export function selectProvider(): LlmProvider {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase().trim();

  if (forced === "fallback") return new FallbackProvider();
  if (forced === "bedrock") return new BedrockProvider();
  if (forced === "gemini") return new GeminiProvider();
  if (forced === "sarvam") return new SarvamProvider();

  if (process.env.BEDROCK_MODEL_ID) return new BedrockProvider();
  if (process.env.GEMINI_API_KEY) return new GeminiProvider();
  if (process.env.SARVAM_API_KEY) return new SarvamProvider();
  return new FallbackProvider();
}
