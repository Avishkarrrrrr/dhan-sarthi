import type { DiscoverySlot, FinancialSnapshot } from "@/lib/contracts/types";
import { parseAmount, parseGoals, parsePercent, parseRisk, parseYears } from "./parse";
import type { WarningKey } from "./phrases";

/**
 * The eight things the avatar has to find out, and how it asks.
 *
 * This is a slot-filling interview, not a free conversation, and that is the
 * point. A bounded set of questions in a fixed order is resumable, testable
 * and safe to run live on a stage; a freeform chatbot asked to produce an
 * investment policy statement is none of those things. The model does exactly
 * two jobs per turn — read one value out of one sentence, and phrase the next
 * question. The flow control is ours.
 */

export interface SlotDef {
  id: DiscoverySlot;
  /** Deterministic reading of the answer. Undefined means "did not understand". */
  parse: (text: string, snapshot: FinancialSnapshot) => unknown;
  /**
   * A warning, not a rejection. When someone says they can invest more than
   * they earn, the right move is to say so and let them decide — refusing
   * their own number would be the app telling a customer they are wrong about
   * their own life.
   *
   * Returns a key and its numbers rather than a sentence, because the sentence
   * has to come out in the customer's language and this file does not know
   * which that is.
   */
  check?: (
    value: unknown,
    snapshot: FinancialSnapshot,
  ) => { key: WarningKey; stated?: number; surplus?: number } | undefined;
}

export const SLOTS: SlotDef[] = [
  {
    id: "shortTermGoals",
    parse: (t) => parseGoals(t),
  },
  {
    id: "longTermGoals",
    parse: (t) => parseGoals(t),
  },
  {
    id: "horizonYears",
    parse: (t) => parseYears(t),
    check: (v) => ((v as number) > 40 ? { key: "long_horizon" as const } : undefined),
  },
  {
    id: "targetCorpus",
    parse: (t) => parseAmount(t),
  },
  {
    id: "monthlyInvestable",
    parse: (t) => parseAmount(t),
    check: (v, s) => {
      const stated = v as number;
      const surplus = s.investableSurplus;
      if (surplus > 0 && stated > surplus * 1.1) {
        return { key: "over_surplus" as const, stated, surplus };
      }
      return undefined;
    },
  },
  {
    id: "annualStepUpPct",
    parse: (t) => {
      // "No" is a real answer here, and it means zero rather than confusion.
      if (/\b(no|nope|nahi|can't|cannot|nothing)\b/i.test(t)) return 0;
      return parsePercent(t);
    },
  },
  {
    id: "riskAppetite",
    parse: (t) => {
      const direct = parseRisk(t);
      if (direct) return direct;
      /*
       * The question asks what they would *do*, so the answer is a verb, not a
       * label — and it arrives in whichever language they are being
       * interviewed in. Buying is checked before selling because "I would not
       * sell, I would buy more" contains both.
       */
      if (/(\bbuy more\b|\badd\b|\bbuy\b|\bkharid\b|\bdouble down\b|और ख़रीद|और खरीद|आणखी घे|மேலும் வாங்க|ఇంకా కొన|আরও কিন)/i.test(t)) {
        return "aggressive";
      }
      if (/(\bsell\b|\bexit\b|\bwithdraw\b|\bnikal\b|\bbech\b|बेच|निकाल|विके|விற்ப|அమ్మ|అమ్మ|বেচ|তুলে)/i.test(t)) {
        return "conservative";
      }
      if (/(\bwait\b|\bhold\b|\bnothing\b|\bstay\b|\bruko\b|\bsit\b|इंतज़ार|इंतजार|रुक|टिक|थांब|वाट पाह|காத்திரு|பொறு|வைத்திரு|వేచి|ఆగ|অপেক্ষা|ধরে রাখ)/i.test(t)) {
        return "moderate";
      }
      return undefined;
    },
  },
  {
    id: "liquidityBufferMonths",
    parse: (t) => {
      const n = parseAmount(t);
      return n !== undefined && n <= 36 ? Math.round(n) : undefined;
    },
  },
];

export function slotDef(id: DiscoverySlot): SlotDef {
  const def = SLOTS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown slot ${id}`);
  return def;
}
