import type {
  Allocation,
  AssetClass,
  FinancialSnapshot,
  ProposedAction,
} from "@/lib/contracts/types";
import { ASSET_CLASSES } from "@/lib/contracts/types";

/**
 * Turn an allocation into things a person can actually do.
 *
 * A pie chart is not an instruction. "Mutual funds 45%" tells a customer
 * nothing about what happens on Monday; "move ₹2.4 lakh from your savings
 * account into a Nifty 50 index fund" does. Both approval screens read this
 * same list — the customer sees it as *is this what I want done with my
 * money*, the RM sees it as *does the bank stand behind recommending it* —
 * which is exactly why it is one contract and not two.
 */

/**
 * The vehicle each class is expressed through.
 *
 * These names are deliberately the ones `lib/finance/xray.ts` can classify, so
 * the action a customer approves and the look-through that judges it are
 * talking about the same instrument rather than two plausible fictions.
 */
const INSTRUMENTS: Record<AssetClass, string> = {
  equity: "Blue-chip stocks",
  mutual_fund: "Nifty 50 Index Fund",
  bonds: "Short-duration debt fund",
  fd: "IDBI Fixed Deposit",
  gold: "Sovereign Gold Bonds",
  cash: "IDBI Savings Account",
};

/**
 * Below this, an action is not worth a customer's attention or an RM's
 * signature. Rebalancing ₹900 costs more in friction than it can return.
 */
export const MIN_ACTION_VALUE = 5000;

export function proposeActions(
  allocation: Allocation,
  snapshot: FinancialSnapshot,
): ProposedAction[] {
  const netWorth = snapshot.netWorth;
  const current = snapshot.allocationByClass;
  const sells: ProposedAction[] = [];
  const buys: ProposedAction[] = [];

  for (const cls of ASSET_CLASSES) {
    const delta = (allocation.weights[cls] ?? 0) - (current[cls] ?? 0);
    const amount = Math.round(Math.abs(delta) * netWorth);
    if (amount < MIN_ACTION_VALUE) continue;

    const from = pct(current[cls] ?? 0);
    const to = pct(allocation.weights[cls] ?? 0);
    if (delta > 0) {
      buys.push({
        kind: "buy",
        instrument: INSTRUMENTS[cls],
        amount,
        reason: `Takes ${label(cls)} from ${from} to ${to} of the portfolio.`,
      });
    } else {
      sells.push({
        kind: "sell",
        instrument: INSTRUMENTS[cls],
        amount,
        reason: `Brings ${label(cls)} down from ${from} to ${to}, which is what funds the rest.`,
      });
    }
  }

  /*
   * Sells first. They pay for the buys, and a list that asks someone to buy
   * before it tells them where the money comes from reads as if we expect
   * them to find it.
   */
  const actions = [...sells, ...buys];

  // The plan's own shortfall, if the committee computed one.
  const gap = allocation.gap;
  if (gap) {
    if (gap.shortfall > 0) {
      actions.push({
        kind: gap.statedMonthlySip > 0 ? "step_up_sip" : "start_sip",
        instrument: INSTRUMENTS.mutual_fund,
        amount: gap.requiredMonthlySip,
        reason:
          `Your goal needs about ₹${inr(gap.requiredMonthlySip)} a month; the plan currently ` +
          `has ₹${inr(gap.statedMonthlySip)}. At the stated amount you reach ` +
          `₹${inr(gap.projectedCorpus)} against a ₹${inr(gap.targetCorpus)} target.`,
      });
    } else if (gap.statedMonthlySip > 0) {
      actions.push({
        kind: "start_sip",
        instrument: INSTRUMENTS.mutual_fund,
        amount: gap.statedMonthlySip,
        reason: `₹${inr(gap.statedMonthlySip)} a month reaches ₹${inr(gap.projectedCorpus)} — enough for this goal.`,
      });
    }
  }

  return actions;
}

/** The total a human is being asked to authorise. Drives the value threshold. */
export function actionValue(actions: ProposedAction[]): number {
  return actions
    .filter((a) => a.kind === "buy" || a.kind === "sell" || a.kind === "switch")
    .reduce((s, a) => s + a.amount, 0);
}

const LABELS: Record<AssetClass, string> = {
  equity: "direct equity",
  mutual_fund: "mutual funds",
  bonds: "bonds",
  fd: "fixed deposits",
  gold: "gold",
  cash: "cash",
};

function label(c: AssetClass): string {
  return LABELS[c] ?? c;
}

function pct(w: number): string {
  return `${Math.round(w * 100)}%`;
}

function inr(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}
