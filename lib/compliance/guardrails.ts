import type { Violation } from "@/lib/contracts/types";

/**
 * Output guardrails on the text the avatar actually speaks.
 *
 * The rules engine vets the *allocation*; this vets the *words*. Both matter —
 * a perfectly suitable portfolio described as "guaranteed" is still a
 * mis-selling incident, and it is the sentence, not the spreadsheet, that the
 * customer remembers.
 */

/**
 * Phrases a regulated advisor cannot say. SEBI's advertisement code bars
 * assured-return and guarantee language outright; the rest are the everyday
 * ways that promise gets made without using the word.
 */
export const BANNED_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bguarantee(d|s)?\b/i, label: "guaranteed returns" },
  { pattern: /\bassured\s+(returns?|income|profits?)\b/i, label: "assured returns" },
  { pattern: /\brisk[-\s]?free\b/i, label: "risk-free" },
  { pattern: /\bno\s+risk\b/i, label: "no risk" },
  { pattern: /\bzero\s+risk\b/i, label: "zero risk" },
  { pattern: /\bcan(no|')?t\s+lose\b/i, label: "cannot lose" },
  { pattern: /\bsure[-\s]?shot\b/i, label: "sure-shot" },
  { pattern: /\bdouble\s+your\s+money\b/i, label: "double your money" },
  { pattern: /\bmultiply\s+your\s+(money|wealth)\b/i, label: "multiply your money" },
  { pattern: /\bdefinitely\s+(will|going\s+to)\s+(rise|grow|return)/i, label: "certainty of gain" },
  { pattern: /\b(will|shall)\s+definitely\b/i, label: "certainty of gain" },
  { pattern: /\bhot\s+tip\b/i, label: "tipping" },
  { pattern: /\binsider\b/i, label: "insider information" },
];

/** Attached to every piece of advice that leaves the system. */
export const DISCLAIMERS = [
  "Mutual fund and market investments are subject to market risks. Please read all scheme-related documents carefully.",
  "This is an automated suitability assessment based on the information available to the bank, not a personal recommendation from a registered investment adviser.",
  "Past performance does not indicate future returns.",
];

/** Scan spoken or written output for language that cannot leave the bank. */
export function checkText(text: string): Violation[] {
  if (!text?.trim()) return [];
  const seen = new Set<string>();
  const out: Violation[] = [];
  for (const { pattern, label } of BANNED_PHRASES) {
    const match = text.match(pattern);
    if (!match || seen.has(label)) continue;
    seen.add(label);
    out.push({
      rule: "guardrail.prohibited_language",
      detail: `Output contains "${match[0]}" — ${label} language cannot be used in investment advice.`,
      severity: "high",
    });
  }
  return out;
}

/**
 * Strip the offending claim rather than dropping the whole answer. A customer
 * who asked a question deserves an answer; they just cannot have that sentence.
 */
export function redactText(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !BANNED_PHRASES.some(({ pattern }) => pattern.test(sentence)))
    .join(" ")
    .trim();
}

/** Append any disclaimer not already present. */
export function ensureDisclaimers(text: string, disclaimers = DISCLAIMERS): string {
  const missing = disclaimers.filter((d) => !text.includes(d));
  return missing.length ? [text.trim(), ...missing].join("\n\n") : text.trim();
}
