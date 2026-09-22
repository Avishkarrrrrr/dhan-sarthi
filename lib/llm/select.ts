import type { LlmProvider } from "./provider";
import { BedrockProvider } from "./bedrock";
import { SarvamProvider } from "./sarvam";
import { FallbackProvider } from "./fallback";

/**
 * Choose a provider from env: Bedrock if it has been opted into, then Sarvam,
 * else the deterministic fallback. Constructing a provider is cheap — the SDK
 * client is only created inside complete().
 *
 * Bedrock takes no API key (it uses the AWS credential chain), so it is opted
 * into with BEDROCK_MODEL_ID rather than sniffed from AWS_REGION — that would
 * hijack selection on any EC2 or Lambda host, where AWS_REGION is always set.
 *
 * Gemini used to sit in this chain and has been removed outright. Two reasons,
 * either of which is sufficient:
 *
 *   1. The bank granted us Claude on Bedrock inside IDBI's own AWS account, so
 *      a customer's balances, goals and spending never leave it. Gemini meant
 *      posting the same data to Google — a third egress destination that was
 *      never declared to IDBI, from a sandbox whose whole premise is that the
 *      data stays inside the bank.
 *   2. It only ever ran when BEDROCK_MODEL_ID was absent, which is to say on
 *      exactly the misconfiguration where nobody would be watching. A fallback
 *      that quietly sends customer data somewhere else is worse than no
 *      fallback: the deterministic provider below fails visibly and locally.
 *
 * A laptop has no Bedrock access — the grant is scoped to the instance role —
 * so local runs land on FallbackProvider. That is the right trade: local chat
 * is deterministic and offline, and the real model answers on the instance,
 * which is where it is judged.
 */
export function selectProvider(): LlmProvider {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase().trim();

  if (forced === "fallback") return new FallbackProvider();
  if (forced === "bedrock") return new BedrockProvider();
  if (forced === "sarvam") return new SarvamProvider();

  if (process.env.BEDROCK_MODEL_ID) return new BedrockProvider();
  if (process.env.SARVAM_API_KEY) return new SarvamProvider();
  return new FallbackProvider();
}
