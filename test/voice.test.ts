import { describe, it, expect } from "vitest";
import { buildTtsPayload, chunkText } from "@/lib/voice/sarvam";
import { normalizeForSpeech, numberToWords } from "@/lib/voice/speechText";

describe("buildTtsPayload", () => {
  it("uses bulbul:v2 and a valid speaker", () => {
    const p = buildTtsPayload("Hello Priya", "en-IN");
    expect(p.model).toBe("bulbul:v2");
    expect(p.speaker).toBeTruthy();
    expect(p.target_language_code).toBe("en-IN");
  });

  it("falls back to en-IN for an unknown language", () => {
    const p = buildTtsPayload("test", "xx-XX");
    expect(p.target_language_code).toBe("en-IN");
  });

  it("truncates a single chunk to the input limit", () => {
    const p = buildTtsPayload("a".repeat(2000), "hi-IN");
    expect(p.text.length).toBeLessThanOrEqual(450);
    expect(p.target_language_code).toBe("hi-IN");
  });
});

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkText("Hello there.")).toEqual(["Hello there."]);
  });
  it("splits long text into multiple chunks under the limit", () => {
    const long = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i}.`).join(" ");
    const chunks = chunkText(long, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    // No content lost (word count preserved roughly).
    expect(chunks.join(" ").length).toBeGreaterThanOrEqual(long.length - chunks.length);
  });
});

describe("numberToWords (Indian system)", () => {
  it("handles thousands and lakhs and crores", () => {
    expect(numberToWords(32000)).toBe("thirty-two thousand");
    expect(numberToWords(1600000)).toBe("sixteen lakh");
    expect(numberToWords(45000000)).toContain("crore");
    expect(numberToWords(0)).toBe("zero");
  });
});

describe("normalizeForSpeech", () => {
  it("speaks rupee amounts as words, not digits", () => {
    const out = normalizeForSpeech("Your net worth is ₹32,000 today.");
    expect(out).toContain("thirty-two thousand rupees");
    expect(out).not.toContain("32,000");
  });
  it("handles Indian-grouped lakhs", () => {
    expect(normalizeForSpeech("₹16,00,000")).toContain("sixteen lakh rupees");
  });
  it("speaks percentages and decimals", () => {
    expect(normalizeForSpeech("up 66%")).toContain("percent");
    expect(normalizeForSpeech("Sharpe 0.32")).toContain("point");
  });
  it("strips markdown symbols", () => {
    expect(normalizeForSpeech("**bold** and _italic_")).not.toMatch(/[*_]/);
  });
});
