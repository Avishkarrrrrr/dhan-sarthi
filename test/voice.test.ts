import { describe, it, expect } from "vitest";
import { buildTtsPayload, chunkText } from "@/lib/voice/sarvam";
import { normalizeForSpeech, numberToWords } from "@/lib/voice/speechText";

describe("buildTtsPayload", () => {
  // v2 is deprecated and 400s, and v3 rejects the v2 speaker names, so the
  // model and the voice have to be pinned together or spoken replies silently
  // fall back to the browser's robotic voice.
  const V3_SPEAKERS = new Set([
    "aditya", "ritu", "ashutosh", "priya", "neha", "rahul", "pooja", "rohan",
    "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun",
    "manan", "sumit", "roopa", "kabir", "aayan", "shubh", "advait", "anand",
    "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani",
    "mohit", "kavitha", "rehan", "soham", "rupali",
  ]);

  it("uses bulbul:v3 with a speaker that model accepts", () => {
    const p = buildTtsPayload("Hello Priya", "en-IN");
    expect(p.model).toBe("bulbul:v3");
    expect(V3_SPEAKERS.has(p.speaker)).toBe(true);
    expect(p.target_language_code).toBe("en-IN");
  });

  it("keeps one voice across every supported language", () => {
    // The advisor should not change identity when the customer switches
    // language mid-conversation.
    const speakers = ["en-IN", "hi-IN", "ta-IN", "mr-IN", "bn-IN"].map(
      (l) => buildTtsPayload("test", l).speaker,
    );
    expect(new Set(speakers).size).toBe(1);
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
