import type { DiscoverySlot, FinancialSnapshot } from "@/lib/contracts/types";
import { parseAmount, parseGoals, parsePercent, parseRisk, parseYears } from "./parse";

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
  /** Asked in English; translated at the voice layer for other languages. */
  question: string;
  /** Asked again, differently, when the first answer was not understood. */
  reask: string;
  /** Deterministic reading of the answer. Undefined means "did not understand". */
  parse: (text: string, snapshot: FinancialSnapshot) => unknown;
  /**
   * A warning, not a rejection. When someone says they can invest more than
   * they earn, the right move is to say so and let them decide — refusing
   * their own number would be the app telling a customer they are wrong about
   * their own life.
   */
  check?: (value: unknown, snapshot: FinancialSnapshot) => string | undefined;
  /** How the value is read back in the confirmation. */
  describe: (value: unknown) => string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const SLOTS: SlotDef[] = [
  {
    id: "shortTermGoals",
    question: "What do you need money for in the next two or three years?",
    reask: "For example a car, a trip, or an emergency fund — what is coming up soon?",
    parse: (t) => parseGoals(t),
    describe: (v) => (v as string[]).join(", ") || "nothing in the short term",
  },
  {
    id: "longTermGoals",
    question: "And further out — what are you building towards?",
    reask: "Retirement, a home, your children's education — what matters most?",
    parse: (t) => parseGoals(t),
    describe: (v) => (v as string[]).join(", ") || "no long-term goal stated",
  },
  {
    id: "horizonYears",
    question: "How many years do you want to give this?",
    reask: "Roughly how long — five years, ten, twenty?",
    parse: (t) => parseYears(t),
    check: (v) =>
      (v as number) > 40
        ? "That is a very long horizon — I will plan for it, but let us revisit it as you get closer."
        : undefined,
    describe: (v) => `${v} years`,
  },
  {
    id: "targetCorpus",
    question: "How much would you like to have at the end of it?",
    reask: "A rough figure is fine — fifty lakh, one crore?",
    parse: (t) => parseAmount(t),
    describe: (v) => inr(v as number),
  },
  {
    id: "monthlyInvestable",
    question: "How much can you set aside each month?",
    reask: "Whatever you can manage comfortably — what monthly amount?",
    parse: (t) => parseAmount(t),
    check: (v, s) => {
      const stated = v as number;
      const surplus = s.investableSurplus;
      if (surplus > 0 && stated > surplus * 1.1) {
        return `You said ${inr(stated)} a month, and your account suggests about ${inr(surplus)} is spare. I will plan with your number — tell me if you would rather I used the smaller one.`;
      }
      return undefined;
    },
    describe: (v) => `${inr(v as number)} a month`,
  },
  {
    id: "annualStepUpPct",
    question: "Can you increase that a little each year, as your income grows?",
    reask: "Even five or ten percent a year makes a large difference — what feels realistic?",
    parse: (t) => {
      // "No" is a real answer here, and it means zero rather than confusion.
      if (/\b(no|nope|nahi|can't|cannot|nothing)\b/i.test(t)) return 0;
      return parsePercent(t);
    },
    describe: (v) => ((v as number) > 0 ? `stepping up ${v}% a year` : "no annual step-up"),
  },
  {
    id: "riskAppetite",
    question:
      "If your investments dropped fifteen percent in a bad month, would you sell, wait, or buy more?",
    reask: "Would a sharp fall worry you, or would you sit through it?",
    parse: (t) => {
      const direct = parseRisk(t);
      if (direct) return direct;
      if (/\b(sell|exit|withdraw|nikal|bech)\b/i.test(t)) return "conservative";
      if (/\b(buy more|add|buy|kharid|double down)\b/i.test(t)) return "aggressive";
      if (/\b(wait|hold|nothing|stay|ruko|sit)\b/i.test(t)) return "moderate";
      return undefined;
    },
    describe: (v) => `a ${v} risk profile`,
  },
  {
    id: "liquidityBufferMonths",
    question: "How many months of expenses would you want to keep within reach?",
    reask: "Most people keep three to six months — what would let you sleep at night?",
    parse: (t) => {
      const n = parseAmount(t);
      return n !== undefined && n <= 36 ? Math.round(n) : undefined;
    },
    describe: (v) => `${v} months of expenses kept liquid`,
  },
];

export function slotDef(id: DiscoverySlot): SlotDef {
  const def = SLOTS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown slot ${id}`);
  return def;
}
