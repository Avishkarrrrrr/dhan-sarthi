import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selectProvider } from "@/lib/llm/select";
import { FallbackProvider } from "@/lib/llm/fallback";
import { buildSystemPrompt, DISCLAIMER } from "@/lib/llm/prompt";
import { getCustomer } from "@/lib/data/customers";

describe("provider selection", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.BEDROCK_MODEL_ID;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to fallback with no keys", () => {
    expect(selectProvider().name).toBe("fallback");
  });

  it("respects forced fallback even if a key exists", () => {
    process.env.SARVAM_API_KEY = "x";
    process.env.LLM_PROVIDER = "fallback";
    expect(selectProvider().name).toBe("fallback");
  });

  it("selects bedrock when forced", () => {
    process.env.LLM_PROVIDER = "bedrock";
    expect(selectProvider().name).toBe("bedrock");
  });

  it("selects bedrock when BEDROCK_MODEL_ID is set", () => {
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-sonnet-5";
    expect(selectProvider().name).toBe("bedrock");
  });

  it("prefers bedrock over a sarvam key once bedrock is opted into", () => {
    process.env.SARVAM_API_KEY = "x";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    expect(selectProvider().name).toBe("bedrock");
  });

  /*
   * Gemini was removed from the chain outright. It only ever ran when Bedrock
   * was not configured — the one case nobody is watching — and it meant
   * posting a customer's balances and goals to Google, a destination never
   * declared to IDBI. With no Bedrock and no Sarvam the answer is the
   * deterministic provider, which fails locally and visibly.
   */
  it("never reaches a third-party model when bedrock is unconfigured", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(selectProvider().name).toBe("fallback");
  });

  it("does not select bedrock from AWS_REGION alone", () => {
    process.env.AWS_REGION = "ap-south-1";
    expect(selectProvider().name).toBe("fallback");
  });
});

describe("fallback responses", () => {
  it("greets using the customer's first name from the system prompt", async () => {
    const sys = buildSystemPrompt(getCustomer("priya")!);
    const reply = await new FallbackProvider().complete(
      [{ role: "user", content: "hello" }],
      sys,
    );
    expect(reply.toLowerCase()).toContain("priya");
  });

  it("gives a portfolio-flavored answer for allocation questions", async () => {
    const sys = buildSystemPrompt(getCustomer("priya")!);
    const reply = await new FallbackProvider().complete(
      [{ role: "user", content: "How is my portfolio allocation?" }],
      sys,
    );
    expect(reply.length).toBeGreaterThan(20);
  });
});

describe("system prompt grounding", () => {
  it("includes net worth and the disclaimer-relevant guardrails", () => {
    const sys = buildSystemPrompt(getCustomer("priya")!);
    expect(sys).toContain("Net worth:");
    expect(sys).toContain("Dhan Sarthi");
    expect(sys).toMatch(/do NOT execute trades/i);
    expect(DISCLAIMER).toMatch(/not investment advice/i);
  });
});
