/**
 * Normalize text so TTS engines (Sarvam Bulbul + browser speechSynthesis)
 * pronounce it naturally. Converts ₹ amounts, comma-grouped numbers,
 * percentages and decimals into spoken words (Indian numbering: lakh/crore),
 * and strips markdown. Without this, "₹32,000" is often read digit-by-digit.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? "-" + ONES[o] : "");
}

function underThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Indian-system number to words (supports up to 99 crore). */
export function numberToWords(num: number): string {
  if (!isFinite(num)) return "";
  if (num === 0) return "zero";
  let n = Math.round(Math.abs(num));
  const parts: string[] = [];

  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;

  if (crore) parts.push(underThousand(crore) + " crore");
  if (lakh) parts.push(twoDigits(lakh) + " lakh");
  if (thousand) parts.push(twoDigits(thousand) + " thousand");
  if (n) parts.push(underThousand(n));

  return (num < 0 ? "minus " : "") + parts.join(" ");
}

function decimalToWords(s: string): string {
  const [intPart, decPart] = s.split(".");
  const intWords = numberToWords(parseInt(intPart, 10));
  const decWords = decPart
    .split("")
    .map((d) => ONES[parseInt(d, 10)])
    .join(" ");
  return `${intWords} point ${decWords}`;
}

export function normalizeForSpeech(text: string): string {
  let t = text;

  // Strip common markdown so it isn't read aloud.
  t = t.replace(/[*_#`]+/g, "");

  // ₹ amounts (with optional lakh/crore words already present handled loosely).
  t = t.replace(/₹\s?([\d,]+)(\.\d+)?/g, (_m, intg: string) => {
    const value = parseInt(intg.replace(/,/g, ""), 10);
    if (isNaN(value)) return " rupees ";
    return " " + numberToWords(value) + " rupees ";
  });

  // Percentages: "66%" or "3.4%" -> words + " percent".
  t = t.replace(/(\d+(?:\.\d+)?)\s?%/g, (_m, num: string) => {
    const spoken = num.includes(".") ? decimalToWords(num) : numberToWords(parseInt(num, 10));
    return " " + spoken + " percent ";
  });

  // Comma-grouped numbers e.g. 32,000 or 16,00,000.
  t = t.replace(/\b\d{1,3}(?:,\d{2,3})+\b/g, (m) => " " + numberToWords(parseInt(m.replace(/,/g, ""), 10)) + " ");

  // Decimals e.g. 0.32, 13.28 (Sharpe, VIX).
  t = t.replace(/\b\d+\.\d+\b/g, (m) => " " + decimalToWords(m) + " ");

  // Plain large integers (>= 1000) without commas.
  t = t.replace(/\b\d{4,}\b/g, (m) => " " + numberToWords(parseInt(m, 10)) + " ");

  // Tidy whitespace.
  return t.replace(/\s{2,}/g, " ").trim();
}
