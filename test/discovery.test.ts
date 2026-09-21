import { describe, it, expect } from "vitest";
import snapshotSample from "@/lib/contracts/fixtures/snapshot.sample.json";
import type { DiscoveryState, FinancialSnapshot } from "@/lib/contracts/types";
import { advance, startSession, toIps } from "@/lib/discovery/machine";
import { phrases } from "@/lib/discovery/phrases";
import { SLOTS } from "@/lib/discovery/slots";
import { parseAmount, parsePercent, parseRisk, parseYears, parseYesNo } from "@/lib/discovery/parse";

const snapshot = snapshotSample as FinancialSnapshot;

/** Run a whole conversation, returning the final state and everything said. */
function converse(answers: string[], start?: DiscoveryState) {
  let state = start ?? startSession("priya");
  const said: string[] = [];
  let ips;
  for (const a of answers) {
    const r = advance(state, a, snapshot);
    state = r.state;
    said.push(r.spokenText);
    if (r.ips) ips = r.ips;
  }
  return { state, said, ips };
}

describe("reading what people actually say", () => {
  it("handles Indian magnitudes", () => {
    expect(parseAmount("50 thousand a month")).toBe(50_000);
    expect(parseAmount("2 lakh")).toBe(200_000);
    expect(parseAmount("1.5 crore")).toBe(15_000_000);
    expect(parseAmount("25k")).toBe(25_000);
    expect(parseAmount("₹1,20,000")).toBe(120000);
  });

  /*
   * Zero is a real answer to "how much can you invest". Returning 0 for "no
   * number here" would silently accept a non-answer as a considered one.
   */
  it("distinguishes a zero from a silence", () => {
    expect(parseAmount("nothing much really")).toBeUndefined();
    expect(parseAmount("0")).toBe(0);
  });

  it("reads a horizon from a duration or a target year", () => {
    expect(parseYears("about 5 years", new Date("2026-01-01"))).toBe(5);
    expect(parseYears("by 2031", new Date("2026-01-01"))).toBe(5);
    expect(parseYears("paanch saal", new Date("2026-01-01"))).toBe(5);
    // "5 lakh" is a misparse of a horizon, not a 500,000-year plan.
    expect(parseYears("5 lakh")).toBeUndefined();
  });

  it("reads yes and no across the words people use", () => {
    expect(parseYesNo("haan bilkul")).toBe(true);
    expect(parseYesNo("no, that's wrong")).toBe(false);
    expect(parseYesNo("hmm")).toBeUndefined();
  });

  it("reads risk appetite from behaviour, not just labels", () => {
    expect(parseRisk("I'd be pretty cautious")).toBe("conservative");
    expect(parsePercent("about 10 percent")).toBe(10);
  });
});

describe("the interview", () => {
  const FULL = [
    "a car and an emergency fund",
    "retirement and my daughter's education",
    "about 15 years",
    "2 crore",
    "50 thousand a month",
    "10 percent",
    "I would wait it out",
    "6 months",
  ];

  it("fills all eight slots and reads the plan back before signing it", () => {
    const { state, said } = converse(FULL);
    expect(state.pending).toHaveLength(0);
    expect(state.status).toBe("confirming");
    expect(said[said.length - 1]).toMatch(/let me confirm what i understood/i);
    // The read-back has to contain the numbers, or it is not a read-back.
    expect(said[said.length - 1]).toMatch(/50,000/);
    expect(said[said.length - 1]).toMatch(/15 years/);
  });

  it("only produces a plan once the customer says yes", () => {
    const mid = converse(FULL);
    expect(mid.ips).toBeUndefined();

    const done = converse(["yes that's right"], mid.state);
    expect(done.state.status).toBe("complete");
    expect(done.ips!.monthlySip).toBe(50_000);
    expect(done.ips!.horizonYears).toBe(15);
    expect(done.ips!.targetCorpus).toBe(20_000_000);
    expect(done.ips!.annualStepUpPct).toBe(10);
    expect(done.ips!.riskProfile).toBe("moderate");
  });

  it("reopens the numbers people change their minds about, on a no", () => {
    const mid = converse(FULL);
    const after = converse(["no, not quite"], mid.state);
    expect(after.state.status).toBe("in_progress");
    expect(after.state.pending).toContain("monthlyInvestable");
    expect(after.said[0]).toMatch(/let us fix that/i);
  });

  it("asks again when it did not understand, exactly once", () => {
    const { state, said } = converse(["a car", "retirement", "hmmm what", "hmmm", "2 crore"]);
    expect(said[2]).toMatch(/roughly how long/i);
    // After a second failure it moves on rather than looping — a stuck
    // question is how a live demo dies.
    expect(state.warnings.some((w) => w.includes("horizonYears"))).toBe(true);
    expect(state.filled.targetCorpus).toBe(20_000_000);
  });

  /*
   * The customer's own number wins. Telling someone they are wrong about
   * their own life is not the app's job — saying so out loud is.
   */
  it("warns when the stated amount exceeds the real surplus, but keeps their number", () => {
    const { state, said, ips } = converse([
      "a car",
      "retirement",
      "10 years",
      "1 crore",
      `${snapshot.investableSurplus * 3} rupees a month`,
      "5 percent",
      "I'd wait",
      "6 months",
      "yes",
    ]);
    expect(state.warnings.some((w) => /your account suggests/i.test(w))).toBe(true);
    expect(said.some((s) => /your account suggests/i.test(s))).toBe(true);
    expect(ips!.monthlySip).toBe(snapshot.investableSurplus * 3);
  });

  it("treats a refused step-up as zero, not as confusion", () => {
    const { state } = converse([
      "a car",
      "retirement",
      "10 years",
      "1 crore",
      "20000",
      "no I can't",
    ]);
    expect(state.filled.annualStepUpPct).toBe(0);
    expect(state.pending[0]).toBe("riskAppetite");
  });

  it("keeps the transcript verbatim for every turn", () => {
    const { state } = converse(["a car and a holiday"]);
    expect(state.turns[0].userTranscript).toBe("a car and a holiday");
    expect(state.turns[0].slot).toBe("shortTermGoals");
  });

  it("falls back to the bank's own view when a slot never got filled", () => {
    const state = startSession("priya");
    state.pending = [];
    const ips = toIps(state, snapshot);
    expect(ips.monthlySip).toBe(snapshot.investableSurplus);
    expect(ips.riskProfile).toBe(snapshot.customer.riskProfile);
  });
});

/*
 * Sarvam will happily speak an English sentence in an Indian voice, which
 * sounds like it works and is not the same thing at all. A customer asked
 * about their retirement in a language they do not read is not being
 * interviewed.
 */
describe("the interview in the customer's own language", () => {
  const LANGS = ["hi-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN"];

  it("asks every question in every offered language", () => {
    for (const lang of LANGS) {
      const say = phrases(lang);
      for (const slot of SLOTS) {
        expect(say.questions[slot.id], `${lang} ${slot.id}`).toBeTruthy();
        expect(say.reasks[slot.id], `${lang} ${slot.id} reask`).toBeTruthy();
        // A question still in English would mean a half-translated interview,
        // which is worse than an honestly English one.
        expect(say.questions[slot.id]).not.toBe(phrases("en-IN").questions[slot.id]);
      }
    }
  });

  it("falls back to English rather than mixing languages", () => {
    expect(phrases("ml-IN").questions.horizonYears).toBe(phrases("en-IN").questions.horizonYears);
    expect(phrases(undefined).confirmed).toBe(phrases("en-IN").confirmed);
  });

  it("runs a whole Hindi conversation to a confirmed plan", () => {
    let state = startSession("priya", "hi-IN");
    const answers = [
      "गाड़ी और इमरजेंसी फंड",
      "रिटायरमेंट और बच्चों की पढ़ाई",
      "15 साल",
      "2 करोड़",
      "50 हज़ार हर महीने",
      "10 प्रतिशत",
      "मैं इंतज़ार करूँगा",
      "6 महीने",
    ];
    let said = "";
    for (const a of answers) {
      const r = advance(state, a, snapshot);
      state = r.state;
      said = r.spokenText;
    }
    expect(state.status).toBe("confirming");
    expect(said).toMatch(/क्या यह सही है/);
    // The magnitudes have to survive the script, or "2 करोड़" becomes ₹2.
    expect(state.filled.targetCorpus).toBe(20_000_000);
    expect(state.filled.monthlyInvestable).toBe(50_000);
    expect(state.filled.horizonYears).toBe(15);

    const done = advance(state, "हाँ, सही है", snapshot);
    expect(done.complete).toBe(true);
    expect(done.ips!.targetCorpus).toBe(20_000_000);
    expect(done.spokenText).toBe(phrases("hi-IN").confirmed);
  });

  it("reads magnitudes in Tamil, Telugu and Bengali", () => {
    expect(parseAmount("ஐம்பது லட்சம்")).toBe(undefined); // words, not numerals
    expect(parseAmount("50 லட்சம்")).toBe(5_000_000);
    expect(parseAmount("1 కోటి")).toBe(10_000_000);
    expect(parseAmount("25 হাজার")).toBe(25_000);
  });

  it("reads yes and no in every language", () => {
    expect(parseYesNo("हाँ")).toBe(true);
    expect(parseYesNo("होय")).toBe(true);
    expect(parseYesNo("ஆம்")).toBe(true);
    expect(parseYesNo("అవును")).toBe(true);
    expect(parseYesNo("হ্যাঁ")).toBe(true);
    expect(parseYesNo("नहीं")).toBe(false);
    expect(parseYesNo("இல்லை")).toBe(false);
    expect(parseYesNo("কাদু")).toBeUndefined();
  });
});
