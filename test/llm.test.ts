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
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to fallback with no keys", () => {
    expect(selectProvider().name).toBe("fallback");
  });

  it("respects forced fallback even if a key exists", () => {
    process.env.GEMINI_API_KEY = "x";
    process.env.LLM_PROVIDER = "fallback";
    expect(selectProvider().name).toBe("fallback");
  });

  it("selects gemini when key present", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(selectProvider().name).toBe("gemini");
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
