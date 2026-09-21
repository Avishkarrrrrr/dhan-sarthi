/**
 * Deterministic extraction of the things people say about money.
 *
 * Tried before the model, not after it. "Fifty thousand a month" and
 * "1.5 lakh" are not hard to read, and a regex that always returns the same
 * answer is worth more here than a call that usually does: this runs live on
 * stage, over a microphone, in a room with bad wifi. The LLM is the fallback
 * for the sentences this cannot handle, which is the opposite of the usual
 * arrangement and deliberate.
 */

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, hundred: 100,
  // The handful of Hindi numerals that turn up in a spoken horizon.
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, saat: 7,
  aath: 8, nau: 9, das: 10, pandrah: 15, bees: 20, pachees: 25, tees: 30,
};

const MULTIPLIERS: { re: RegExp; factor: number }[] = [
  { re: /\b(crore|cr|karod|करोड़)\b/i, factor: 1e7 },
  { re: /\b(lakh|lac|lakhs|lakh's|लाख)\b/i, factor: 1e5 },
  { re: /\b(thousand|hazaar|hazar|hajar|हज़ार|हजार)\b/i, factor: 1e3 },
];

/**
 * The first quantity in a sentence, with Indian magnitude words applied.
 *
 * Returns undefined rather than zero when there is no number: zero is a
 * perfectly valid answer to "how much can you invest", and conflating it with
 * "you did not say" would silently accept a non-answer.
 */
export function parseAmount(text: string): number | undefined {
  const t = (text ?? "").toLowerCase().replace(/,/g, "");

  // "50k" / "2.5l" shorthand.
  const short = t.match(/(\d+(?:\.\d+)?)\s*(k|l|cr)\b/);
  if (short) {
    const n = parseFloat(short[1]);
    const f = short[2] === "k" ? 1e3 : short[2] === "l" ? 1e5 : 1e7;
    return n * f;
  }

  let value: number | undefined;
  const digits = t.match(/(\d+(?:\.\d+)?)/);
  if (digits) value = parseFloat(digits[1]);

  if (value === undefined) {
    for (const [word, n] of Object.entries(WORD_NUMBERS)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(t)) {
        value = n;
        break;
      }
    }
  }
  if (value === undefined) return undefined;

  for (const m of MULTIPLIERS) {
    if (m.re.test(t)) return value * m.factor;
  }
  return value;
}

/** A number of years, from "5 years", "paanch saal", "by 2031". */
export function parseYears(text: string, now = new Date()): number | undefined {
  const t = (text ?? "").toLowerCase();

  // An explicit target year is more precise than a duration, so try it first.
  const year = t.match(/\b(20[2-9]\d)\b/);
  if (year) {
    const diff = parseInt(year[1], 10) - now.getUTCFullYear();
    if (diff > 0) return diff;
  }

  const months = t.match(/(\d+)\s*(months?|mahine|महीने)/);
  if (months) return Math.max(1, Math.round(parseInt(months[1], 10) / 12));

  const n = parseAmount(t);
  if (n === undefined) return undefined;
  // "5 lakh years" is a misparse, not a horizon.
  return n > 0 && n <= 60 ? Math.round(n) : undefined;
}

/** A percentage, from "10 percent", "10%", "ten per cent". */
export function parsePercent(text: string): number | undefined {
  const t = (text ?? "").toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(%|percent|per cent|pct|प्रतिशत)/);
  if (m) return parseFloat(m[1]);
  // A bare small number in answer to a percentage question is a percentage.
  const n = parseAmount(t);
  return n !== undefined && n <= 100 ? n : undefined;
}

/** Yes / no / neither, across the words people actually use. */
export function parseYesNo(text: string): boolean | undefined {
  const t = (text ?? "").toLowerCase().trim();
  if (/\b(yes|yeah|yep|correct|right|sure|ok|okay|haan|haa|ha|ji|sahi|theek|confirm|confirmed|go ahead)\b/.test(t)) {
    return true;
  }
  if (/\b(no|nope|not|wrong|nahi|nahin|na|galat|change|cancel)\b/.test(t)) return false;
  return undefined;
}

/** Risk appetite, from how someone describes themselves. */
export function parseRisk(text: string): "conservative" | "moderate" | "aggressive" | undefined {
  const t = (text ?? "").toLowerCase();
  if (/\b(aggressive|high risk|risky|growth|bold|zyada risk|high)\b/.test(t)) return "aggressive";
  if (/\b(conservative|safe|low risk|cautious|careful|surakshit|kam risk|low|fd|deposit)\b/.test(t)) {
    return "conservative";
  }
  if (/\b(moderate|balanced|medium|middle|thoda|average)\b/.test(t)) return "moderate";
  return undefined;
}

/**
 * Goals, split on the words people separate lists with.
 *
 * No attempt to categorise them. "My daughter's wedding" is a goal whatever
 * taxonomy we might have invented for it, and the horizon question is what
 * makes it short or long term — not a guess at what the words mean.
 */
export function parseGoals(text: string): string[] {
  return (text ?? "")
    .split(/\band\b|,|;|\bplus\b|\baur\b|\bthen\b/i)
    .map((g) => g.trim().replace(/^(i want|i need|for|to|my)\s+/i, "").trim())
    .filter((g) => g.length > 2)
    .slice(0, 4);
}
