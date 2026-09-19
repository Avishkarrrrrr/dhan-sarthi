import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { ChatMsg, CompleteOpts, LlmProvider } from "./provider";

/**
 * Bedrock model id. On Bedrock, Anthropic ids carry an `anthropic.` prefix.
 * Some regions (ap-south-1 among them) only expose the newer Claude models
 * through a cross-region inference profile, in which case the id becomes
 * `global.anthropic.claude-sonnet-5`. Override with BEDROCK_MODEL_ID rather
 * than editing this — which form a region needs is an environment fact.
 */
const DEFAULT_MODEL = "anthropic.claude-sonnet-5";
const DEFAULT_REGION = "ap-south-1";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

/**
 * The research route asks for JSON. Claude has no Gemini-style
 * responseMimeType, and structured outputs are not uniformly available across
 * Bedrock regions, so we instruct instead — the route's own tryParse() already
 * strips fences and extracts the first {...} block, so this is belt-and-braces.
 */
const JSON_NUDGE =
  "\n\nReturn the raw JSON object only — no markdown fences, no prose before or after it.";

function textOf(res: { content: Array<{ type: string }> }): string {
  return res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Amazon Bedrock (Claude) provider — the in-VPC reasoning engine for the IDBI
 * sandbox deployment. Credentials come from the standard AWS chain (instance
 * profile / task role in the sandbox, ~/.aws locally), so there is no API key.
 */
export class BedrockProvider implements LlmProvider {
  name = "bedrock" as const;

  async complete(messages: ChatMsg[], system: string, opts: CompleteOpts = {}): Promise<string> {
    const awsRegion = process.env.AWS_REGION || DEFAULT_REGION;
    const model = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
    const client = new AnthropicBedrockMantle({ awsRegion });

    const rawEffort = (process.env.BEDROCK_EFFORT || "").toLowerCase().trim();
    const effort = EFFORTS.includes(rawEffort as Effort) ? (rawEffort as Effort) : undefined;

    // No temperature/top_p/top_k: current Claude models reject sampling
    // params with a 400. Effort is opt-in via env because we cannot yet verify
    // output_config against this account's Bedrock endpoint (see SCP note
    // below) and a hard-coded param would break the first real call.
    const call = () =>
      client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 500,
        system: opts.json ? system + JSON_NUDGE : system,
        messages,
        ...(effort ? { output_config: { effort } } : {}),
      });

    try {
      return textOf(await call());
    } catch (err: unknown) {
      const msg = String((err as Error)?.message ?? err);

      // Throttling / transient: one retry, matching the Gemini provider.
      if (/429|throttl|rate|ServiceUnavailable|503|timeout/i.test(msg)) {
        return textOf(await call());
      }

      // Surface the failure this account actually hits today, so it is not
      // mistaken for a bug in the app.
      if (/AccessDenied|not authorized|explicit deny|service control policy/i.test(msg)) {
        throw new Error(
          `Bedrock denied InvokeModel for ${model} in ${awsRegion}. ` +
            `If this mentions a service control policy, it is an AWS Organizations ` +
            `restriction on the account, not an app or credential problem. Original: ${msg}`,
        );
      }
      throw err;
    }
  }
}
