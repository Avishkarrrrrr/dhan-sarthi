import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import type { ChatMsg, CompleteOpts, LlmProvider } from "./provider";

/**
 * Bedrock model id. On Bedrock, Anthropic ids carry an `anthropic.` prefix.
 *
 * The IDBI sandbox grants exactly one model — Claude 3 Haiku, by its direct
 * foundation-model ARN. Newer models there are only reachable through
 * cross-region inference profiles (`global.anthropic.…`), which the sandbox's
 * IAM policy does not cover. Override with BEDROCK_MODEL_ID; which ids an
 * account may invoke is an environment fact, not a code decision.
 */
const DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";
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

  /**
   * Stream the reply as Claude produces it.
   *
   * Worth the extra path: the first words reach the customer in a few hundred
   * milliseconds instead of after the whole answer, and the avatar can start
   * speaking a sentence while the rest is still being written.
   */
  async *stream(
    messages: ChatMsg[],
    system: string,
    opts: CompleteOpts = {},
  ): AsyncIterable<string> {
    const client = new AnthropicBedrock({ awsRegion: process.env.AWS_REGION || DEFAULT_REGION });
    const model = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;

    const s = client.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 500,
      system: opts.json ? system + JSON_NUDGE : system,
      messages,
    });

    for await (const event of s) {
      if (
        event.type === "content_block_delta" &&
        "delta" in event &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  async complete(messages: ChatMsg[], system: string, opts: CompleteOpts = {}): Promise<string> {
    const awsRegion = process.env.AWS_REGION || DEFAULT_REGION;
    const model = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
    // AnthropicBedrock targets bedrock-runtime InvokeModel, which is what the
    // sandbox's IAM policy actually permits (it is scoped to the
    // foundation-model ARN). The newer Mantle client routes differently and is
    // not covered by that grant.
    const client = new AnthropicBedrock({ awsRegion });

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
