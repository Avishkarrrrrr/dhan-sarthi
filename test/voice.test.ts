import { describe, it, expect } from "vitest";
import { buildTtsPayload } from "@/lib/voice/sarvam";

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

  it("truncates very long text to the input limit", () => {
    const p = buildTtsPayload("a".repeat(2000), "hi-IN");
    expect(p.text.length).toBeLessThanOrEqual(450);
    expect(p.target_language_code).toBe("hi-IN");
  });
});
