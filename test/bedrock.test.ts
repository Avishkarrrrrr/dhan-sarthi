import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/bedrock-sdk", () => ({
  AnthropicBedrockMantle: class {
    config: unknown;
    messages = { create };
    constructor(config: unknown) {
      this.config = config;
      seen.push(config);
    }
  },
}));

const seen: unknown[] = [];

import { BedrockProvider } from "@/lib/llm/bedrock";

const msgs = [{ role: "user" as const, content: "How is my portfolio?" }];

describe("BedrockProvider", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    create.mockReset();
    seen.length = 0;
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_EFFORT;
    delete process.env.AWS_REGION;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const ok = (text: string) => ({ content: [{ type: "text", text }] });

  it("concatenates text blocks and ignores non-text blocks", async () => {
    create.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "ignored" },
        { type: "text", text: "Hello " },
        { type: "text", text: "Priya.  " },
      ],
    });
    expect(await new BedrockProvider().complete(msgs, "sys")).toBe("Hello Priya.");
  });

  it("defaults to the anthropic-prefixed Sonnet id in ap-south-1", async () => {
    create.mockResolvedValue(ok("hi"));
    await new BedrockProvider().complete(msgs, "sys");
    expect(create.mock.calls[0][0].model).toBe("anthropic.claude-sonnet-5");
    expect(seen[0]).toEqual({ awsRegion: "ap-south-1" });
  });

  it("honours BEDROCK_MODEL_ID for cross-region inference profiles", async () => {
    process.env.BEDROCK_MODEL_ID = "global.anthropic.claude-sonnet-5";
    create.mockResolvedValue(ok("hi"));
    await new BedrockProvider().complete(msgs, "sys");
    expect(create.mock.calls[0][0].model).toBe("global.anthropic.claude-sonnet-5");
  });

  it("never sends sampling params, which current Claude models reject", async () => {
    create.mockResolvedValue(ok("hi"));
    await new BedrockProvider().complete(msgs, "sys");
    const sent = create.mock.calls[0][0];
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("top_p");
    expect(sent).not.toHaveProperty("top_k");
  });

  it("omits output_config unless BEDROCK_EFFORT is a valid level", async () => {
    create.mockResolvedValue(ok("hi"));
    await new BedrockProvider().complete(msgs, "sys");
    expect(create.mock.calls[0][0]).not.toHaveProperty("output_config");

    create.mockResolvedValue(ok("hi"));
    process.env.BEDROCK_EFFORT = "nonsense";
    await new BedrockProvider().complete(msgs, "sys");
    expect(create.mock.calls[1][0]).not.toHaveProperty("output_config");

    create.mockResolvedValue(ok("hi"));
    process.env.BEDROCK_EFFORT = "medium";
    await new BedrockProvider().complete(msgs, "sys");
    expect(create.mock.calls[2][0].output_config).toEqual({ effort: "medium" });
  });

  it("appends a JSON-only instruction when json is requested", async () => {
    create.mockResolvedValue(ok("{}"));
    await new BedrockProvider().complete(msgs, "BASE", { json: true, maxTokens: 1000 });
    const sent = create.mock.calls[0][0];
    expect(sent.system).toMatch(/^BASE/);
    expect(sent.system).toMatch(/raw JSON object only/);
    expect(sent.max_tokens).toBe(1000);
  });

  it("retries once on throttling", async () => {
    create.mockRejectedValueOnce(new Error("ThrottlingException: rate exceeded"));
    create.mockResolvedValueOnce(ok("second try"));
    expect(await new BedrockProvider().complete(msgs, "sys")).toBe("second try");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("explains an SCP denial rather than leaking a raw AccessDenied", async () => {
    create.mockRejectedValue(
      new Error(
        "AccessDeniedException: not authorized to perform bedrock:InvokeModel " +
          "with an explicit deny in a service control policy",
      ),
    );
    await expect(new BedrockProvider().complete(msgs, "sys")).rejects.toThrow(
      /AWS Organizations restriction on the account, not an app or credential problem/,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rethrows unrecognised errors untouched", async () => {
    create.mockRejectedValue(new Error("boom"));
    await expect(new BedrockProvider().complete(msgs, "sys")).rejects.toThrow("boom");
  });
});
