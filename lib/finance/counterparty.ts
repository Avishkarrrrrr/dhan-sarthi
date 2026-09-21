import type { OutflowDestination } from "@/lib/contracts/types";

/**
 * Where money is going when it leaves the bank.
 *
 * Read from the statement narration, which is the only place this is visible.
 * A transfer to a broker and a transfer to a plumber look identical in an
 * amount column; the difference is entirely in the words beside it.
 *
 * ⚠️ **The IDBI sandbox has no narration.** Every row comes back as
 * "S1 TXN 7" with `txnCat: "TCI"`, so against live sandbox data this
 * classifier will honestly find nothing, and the radar reports that rather
 * than inventing counterparties. It works on any feed that carries real
 * narration — a production core-banking feed, an imported statement, or the
 * bundled demo personas.
 */

const PATTERNS: { re: RegExp; destination: OutflowDestination; label: string }[] = [
  { re: /\b(zerodha|groww|upstox|angel\s*one|icici\s*direct|kotak\s*securities|5paisa|dhan)\b/i, destination: "external_broker", label: "broker" },
  { re: /\b(coin|kuvera|et\s*money|paytm\s*money|indmoney|mf\s*utility|mfu)\b/i, destination: "mf_platform", label: "mutual fund platform" },
  { re: /\b(bajaj\s*fin|shriram|mahindra\s*fin|muthoot|manappuram|sundaram\s*fin)\b/i, destination: "nbfc_deposit", label: "NBFC deposit" },
  { re: /\b(hdfc|icici|axis|kotak|sbi|yes\s*bank|indusind|federal\s*bank|rbl)\b/i, destination: "competitor_bank", label: "another bank" },
];

export interface Counterparty {
  destination: OutflowDestination;
  /** What the narration actually said — quoted, never paraphrased. */
  hint: string;
  label: string;
}

/** Classify one narration. `unknown` when nothing matches — including a blank. */
export function classifyCounterparty(narration: string): Counterparty {
  const text = (narration ?? "").trim();
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      return { destination: p.destination, hint: m[0].toUpperCase(), label: p.label };
    }
  }
  return { destination: "unknown", hint: "", label: "unidentified" };
}

/** Human wording for a destination, for the narrative the RM reads. */
export const DESTINATION_LABEL: Record<OutflowDestination, string> = {
  external_broker: "an external broker",
  competitor_bank: "another bank",
  nbfc_deposit: "an NBFC deposit",
  mf_platform: "a mutual fund platform",
  unknown: "an unidentified destination",
};
