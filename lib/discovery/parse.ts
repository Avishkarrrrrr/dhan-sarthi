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

/*
 * Numbers as Sarvam's STT actually writes them back. Tested by round trip on
 * 3 Oct 2026 — Sarvam speaks a native answer, Sarvam transcribes it, this
 * parser reads it — and outside English and Hindi most amounts came back as
 * words ("पन्नास हजार", "యాభై వేల", "ஐம்பதாயிரம்") or in native digits
 * ("৫০,০০০"), none of which the digit and English-word paths could read. A
 * Marathi or Bengali customer saying how much they could invest was silently
 * heard as saying nothing.
 */
const NATIVE_DIGIT_ZEROS = [0x0966, 0x09e6, 0x0be6, 0x0c66]; // Devanagari, Bengali, Tamil, Telugu

/** "५०,०००" → "50,000". Everything downstream only has to know ASCII. */
export function asciiDigits(text: string): string {
  return text.replace(/[०-९০-৯௦-௯౦-౯]/g, (ch) => {
    const c = ch.charCodeAt(0);
    const zero = NATIVE_DIGIT_ZEROS.find((z) => c >= z && c <= z + 9)!;
    return String(c - zero);
  });
}

/*
 * Number words per script, largest first so a compound is matched before the
 * word inside it (पंचवीस before वीस, ఇరవై ఐదు before ఐదు). Fractions lead:
 * "डेढ़ लाख" is how people say 1.5 lakh.
 *
 * Devanagari, Bengali and Telugu words are matched whole — not inside another
 * word of the same script — because the short ones are real words too (नौ in
 * नौकरी, বিশ in বিশ্বাস). Tamil joins number and magnitude into one word
 * ("ஐம்பதாயிரம்"), so Tamil entries are stems matched anywhere.
 */
type Script = "deva" | "beng" | "telu" | "taml";
const SCRIPT_RANGE: Record<Script, string> = {
  deva: "\\u0900-\\u097F",
  beng: "\\u0980-\\u09FF",
  telu: "\\u0C00-\\u0C7F",
  taml: "",
};
const INDIC_WORDS: [Script, string, number][] = [
  // Hindi
  ["deva", "डेढ़", 1.5], ["deva", "डेढ", 1.5], ["deva", "ढाई", 2.5],
  ["deva", "सौ", 100], ["deva", "नब्बे", 90], ["deva", "अस्सी", 80], ["deva", "सत्तर", 70],
  ["deva", "साठ", 60], ["deva", "पचास", 50], ["deva", "चालीस", 40], ["deva", "पच्चीस", 25],
  ["deva", "तीस", 30], ["deva", "बीस", 20], ["deva", "पंद्रह", 15], ["deva", "दस", 10],
  ["deva", "नौ", 9], ["deva", "आठ", 8], ["deva", "सात", 7], ["deva", "छह", 6],
  ["deva", "पांच", 5], ["deva", "पाँच", 5], ["deva", "चार", 4], ["deva", "तीन", 3],
  // Marathi
  ["deva", "दीड", 1.5], ["deva", "अडीच", 2.5], ["deva", "शंभर", 100], ["deva", "नव्वद", 90],
  ["deva", "ऐंशी", 80], ["deva", "पन्नास", 50], ["deva", "चाळीस", 40], ["deva", "पंचवीस", 25],
  ["deva", "वीस", 20], ["deva", "पंधरा", 15], ["deva", "दहा", 10], ["deva", "नऊ", 9],
  ["deva", "सहा", 6], ["deva", "पाच", 5],
  // Bengali
  ["beng", "দেড়", 1.5], ["beng", "আড়াই", 2.5], ["beng", "একশো", 100], ["beng", "নব্বই", 90],
  ["beng", "আশি", 80], ["beng", "সত্তর", 70], ["beng", "ষাট", 60], ["beng", "পঞ্চাশ", 50],
  ["beng", "চল্লিশ", 40], ["beng", "ত্রিশ", 30], ["beng", "পঁচিশ", 25], ["beng", "বিশ", 20],
  ["beng", "পনেরো", 15], ["beng", "দশ", 10], ["beng", "নয়", 9], ["beng", "আট", 8],
  ["beng", "সাত", 7], ["beng", "ছয়", 6], ["beng", "পাঁচ", 5], ["beng", "চার", 4], ["beng", "তিন", 3],
  // Telugu
  ["telu", "ఒకటిన్నర", 1.5], ["telu", "రెండున్నర", 2.5], ["telu", "వంద", 100],
  ["telu", "తొంభై", 90], ["telu", "ఎనభై", 80], ["telu", "డెబ్బై", 70], ["telu", "అరవై", 60],
  ["telu", "యాభై", 50], ["telu", "నలభై", 40], ["telu", "ముప్పై", 30], ["telu", "ఇరవై ఐదు", 25],
  ["telu", "ఇరవై", 20], ["telu", "పదిహేను", 15], ["telu", "పది", 10], ["telu", "తొమ్మిది", 9],
  ["telu", "ఎనిమిది", 8], ["telu", "ఏడు", 7], ["telu", "ఆరు", 6], ["telu", "ఐదు", 5],
  ["telu", "నాలుగు", 4], ["telu", "మూడు", 3],
  // Tamil (stems)
  ["taml", "ஒன்றரை", 1.5], ["taml", "இரண்டரை", 2.5], ["taml", "நூறு", 100],
  ["taml", "தொண்ணூறு", 90], ["taml", "எண்பது", 80], ["taml", "எழுபது", 70], ["taml", "அறுபது", 60],
  ["taml", "ஐம்பத", 50], ["taml", "நாற்பத", 40], ["taml", "இருபத்தைந்து", 25], ["taml", "முப்பத", 30],
  ["taml", "இருபத", 20], ["taml", "பதினைந்து", 15], ["taml", "பத்து", 10], ["taml", "ஒன்பது", 9],
  ["taml", "எட்டு", 8], ["taml", "ஏழு", 7], ["taml", "ஐந்து", 5], ["taml", "நான்கு", 4],
  ["taml", "மூன்று", 3],
];
/*
 * One and two are also everyday words — एक is "a", दो is "give", ஒரு is "a" —
 * so they count only beside a magnitude: "दो लाख" is two lakh, "बता दो" is not
 * a number at all.
 */
const INDIC_WITH_MAGNITUDE: [Script, string, number][] = [
  ["deva", "एक", 1], ["deva", "दो", 2], ["deva", "दोन", 2],
  ["beng", "এক", 1], ["beng", "দুই", 2],
  ["telu", "ఒక", 1], ["telu", "రెండు", 2],
  ["taml", "ஒரு", 1], ["taml", "ஒன்று", 1], ["taml", "இரண்டு", 2],
];

function indicPattern(script: Script, word: string): RegExp {
  const r = SCRIPT_RANGE[script];
  return r ? new RegExp(`(?<![${r}])${word}(?![${r}])`) : new RegExp(word);
}
const INDIC = INDIC_WORDS.map(([sc, w, n]) => ({ re: indicPattern(sc, w), n }));
const INDIC_MAG = INDIC_WITH_MAGNITUDE.map(([sc, w, n]) => ({ re: indicPattern(sc, w), n }));

/*
 * Magnitude words, in every script the interview is offered in. Sarvam's STT
 * returns the customer's own language, so "ஐம்பது லட்சம்" arrives in Tamil and
 * an English-only matcher would silently read it as fifty.
 *
 * No `\b` around the Indic alternatives: word boundaries are defined by ASCII
 * word characters, so `\b` never matches beside Devanagari or Tamil text and
 * the pattern would never fire.
 */
const MULTIPLIERS: { re: RegExp; factor: number }[] = [
  { re: /(\bcrore\b|\bcr\b|\bkarod\b|करोड़|कोटी|கோடி|కోటి|কোটি)/i, factor: 1e7 },
  { re: /(\blakh\b|\blac\b|\blakhs\b|लाख|லட்ச|లక్ష|লাখ|লক্ষ)/i, factor: 1e5 },
  { re: /(\bthousand\b|\bhazaar\b|\bhazar\b|\bhajar\b|हज़ार|हजार|ஆயிரம்|யிரம்|వేల|వెయ్యి|হাজার)/i, factor: 1e3 },
];

/**
 * The first quantity in a sentence, with Indian magnitude words applied.
 *
 * Returns undefined rather than zero when there is no number: zero is a
 * perfectly valid answer to "how much can you invest", and conflating it with
 * "you did not say" would silently accept a non-answer.
 */
export function parseAmount(text: string): number | undefined {
  const t = asciiDigits(text ?? "").toLowerCase().replace(/,/g, "");

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
  if (value === undefined) value = INDIC.find((w) => w.re.test(t))?.n;

  const magnitude = MULTIPLIERS.find((m) => m.re.test(t))?.factor;
  if (value === undefined && magnitude) {
    // "दो लाख", "ஒரு லட்சம்" — or the magnitude alone: "लाख" is one lakh.
    value = INDIC_MAG.find((w) => w.re.test(t))?.n ?? 1;
  }
  if (value === undefined) return undefined;
  return magnitude ? value * magnitude : value;
}

/** A number of years, from "5 years", "paanch saal", "by 2031". */
export function parseYears(text: string, now = new Date()): number | undefined {
  const t = asciiDigits(text ?? "").toLowerCase();

  // An explicit target year is more precise than a duration, so try it first.
  const year = t.match(/\b(20[2-9]\d)\b/);
  if (year) {
    const diff = parseInt(year[1], 10) - now.getUTCFullYear();
    if (diff > 0) return diff;
  }

  const months = t.match(/(\d+)\s*(months?|mahine|महीने|महिने|மாத|నెల|মাস)/);
  if (months) return Math.max(1, Math.round(parseInt(months[1], 10) / 12));

  const n = parseAmount(t);
  if (n === undefined) return undefined;
  // "5 lakh years" is a misparse, not a horizon.
  return n > 0 && n <= 60 ? Math.round(n) : undefined;
}

/** A percentage, from "10 percent", "10%", "ten per cent". */
export function parsePercent(text: string): number | undefined {
  const t = asciiDigits(text ?? "").toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(%|percent|per cent|pct|प्रतिशत|टक्के|சதவீத|శాతం|শতাংশ)/);
  if (m) return parseFloat(m[1]);
  // A bare small number in answer to a percentage question is a percentage.
  const n = parseAmount(t);
  return n !== undefined && n <= 100 ? n : undefined;
}

/** Yes / no / neither, across the words people actually use. */
export function parseYesNo(text: string): boolean | undefined {
  const t = (text ?? "").toLowerCase().trim();
  // No is checked first: "no, that's not right" contains "right".
  if (/(\bno\b|\bnope\b|\bnot\b|\bwrong\b|\bnahi\b|\bnahin\b|\bna\b|\bgalat\b|\bchange\b|\bcancel\b|नाही|नहीं|இல்லை|கிடையாது|కాదు|లేదు|না)/.test(t)) {
    return false;
  }
  if (/(\byes\b|\byeah\b|\byep\b|\bcorrect\b|\bright\b|\bsure\b|\bok\b|\bokay\b|\bhaan\b|\bhaa\b|\bha\b|\bji\b|\bsahi\b|\btheek\b|\bconfirm\b|\bconfirmed\b|\bgo ahead\b|हाँ|हां|होय|बरोबर|ஆம்|சரி|అవును|సరే|হ্যাঁ|ঠিক)/.test(t)) {
    return true;
  }
  return undefined;
}

/** Risk appetite, from how someone describes themselves. */
export function parseRisk(text: string): "conservative" | "moderate" | "aggressive" | undefined {
  const t = (text ?? "").toLowerCase();
  if (/(\baggressive\b|\bhigh risk\b|\brisky\b|\bgrowth\b|\bbold\b|\bzyada risk\b|\bhigh\b|आक्रामक|आक्रमक|தீவிர|దూకుడు|আক্রমণাত্মক)/.test(t)) {
    return "aggressive";
  }
  if (/(\bconservative\b|\bsafe\b|\blow risk\b|\bcautious\b|\bcareful\b|\bsurakshit\b|\bkam risk\b|\blow\b|\bfd\b|\bdeposit\b|सुरक्षित|பாதுகாப்ப|సురక్షిత|নিরাপদ)/.test(t)) {
    return "conservative";
  }
  if (/(\bmoderate\b|\bbalanced\b|\bmedium\b|\bmiddle\b|\bthoda\b|\baverage\b|संतुलित|சமநிலை|సమతుల్య|ভারসাম্য)/.test(t)) {
    return "moderate";
  }
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
    .split(/\band\b|,|;|\bplus\b|\baur\b|\bthen\b|और|आणि|மற்றும்|మరియు|এবং/i)
    .map((g) => g.trim().replace(/^(i want|i need|for|to|my)\s+/i, "").trim())
    .filter((g) => g.length > 2)
    .slice(0, 4);
}
