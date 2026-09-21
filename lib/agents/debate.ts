import type { AgentId, AgentView, AssetClass } from "@/lib/contracts/types";
import { ASSET_CLASSES } from "@/lib/contracts/types";

/**
 * The part where the committee is actually a committee.
 *
 * Seven desks each publishing a view and never reading each other's is not a
 * deliberation — it is seven opinions averaged, and the average is nobody's
 * recommendation. A real investment committee argues: the treasury desk says
 * the buffer is thin, and the markets desk moderates its equity call *because
 * of that*, or says why it will not.
 *
 * So this runs a second round. Where two desks genuinely disagree about an
 * asset class, the less confident one concedes ground toward the more
 * confident one, and says so. Two properties make it honest rather than
 * theatre:
 *
 *  - **It changes the answer.** Tilts move, so the strategist fuses different
 *    numbers and the allocation that comes out is different. If it did not
 *    move the output it would be a screensaver.
 *  - **It is deterministic.** Same views in, same argument out. A compliance
 *    trail cannot depend on an argument that goes differently each time it is
 *    replayed.
 *
 * Nobody concedes everything. A desk that abandoned its view the moment
 * someone louder spoke would not be worth seating.
 */

/** Below this gap the desks broadly agree, and there is nothing to discuss. */
export const DISAGREEMENT_THRESHOLD = 0.5;

/** The most of its own position a desk will give up in one exchange. */
export const MAX_CONCESSION = 0.4;

/**
 * A move smaller than this is not worth claiming. Below it the desk holds its
 * ground outright, so the tilt and the sentence describing it never disagree.
 */
export const MIN_CONCESSION = 0.05;

/** How many arguments to run. More than this and the room stops being readable. */
export const MAX_EXCHANGES = 3;

export interface Exchange {
  /** The desk that moved. */
  from: AgentId;
  /** The desk that moved it. */
  to: AgentId;
  assetClass: AssetClass;
  /** What the conceding desk says, in its own voice. */
  text: string;
  /** Tilt before and after, so the change is inspectable rather than asserted. */
  before: number;
  after: number;
}

const LABELS: Record<AssetClass, string> = {
  equity: "direct equity",
  mutual_fund: "mutual funds",
  bonds: "bonds",
  fd: "fixed deposits",
  gold: "gold",
  cash: "cash",
};

const DESK_NAMES: Record<AgentId, string> = {
  treasury: "Treasury",
  markets: "Markets",
  macro: "Volatility",
  bonds: "Fixed income",
  gold: "Gold",
  behaviour: "Behaviour",
  tax: "Tax",
};

/**
 * Run the argument.
 *
 * Returns new views rather than mutating: the original round is what each desk
 * independently believed, and the audit trail is more useful when both that
 * and the post-debate position survive.
 */
export function debate(views: AgentView[]): { views: AgentView[]; exchanges: Exchange[] } {
  const updated = views.map((v) => ({ ...v, tilt: { ...v.tilt } }));
  const exchanges: Exchange[] = [];

  // Largest disagreements first — the room should spend its time on what it
  // most disagrees about, not on whatever happens to come first alphabetically.
  const disputes = ASSET_CLASSES.map((cls) => {
    const holders = updated
      .map((v, i) => ({ i, tilt: v.tilt[cls], confidence: v.confidence }))
      .filter((h): h is { i: number; tilt: number; confidence: number } => typeof h.tilt === "number");
    if (holders.length < 2) return undefined;

    const highest = holders.reduce((a, b) => (b.tilt > a.tilt ? b : a));
    const lowest = holders.reduce((a, b) => (b.tilt < a.tilt ? b : a));
    const gap = highest.tilt - lowest.tilt;
    return gap >= DISAGREEMENT_THRESHOLD ? { cls, highest, lowest, gap } : undefined;
  })
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_EXCHANGES);

  for (const { cls, highest, lowest } of disputes) {
    // Whoever is less sure of themselves is the one who moves. Confidence is
    // the desk's own statement about how much it trusts its reading, so using
    // it to decide who yields is using the committee's own information.
    const [yielding, holding] =
      lowest.confidence <= highest.confidence ? [lowest, highest] : [highest, lowest];

    const speaker = updated[yielding.i];
    const opponent = updated[holding.i];
    const before = speaker.tilt[cls] as number;

    /*
     * How far they move: proportional to how much more certain the other desk
     * is. Two equally confident desks barely shift each other, which is right —
     * a genuine standoff should reach the strategist as a standoff, and the
     * escalation gate is watching the spread precisely so a human sees it.
     */
    const certaintyGap = Math.abs(opponent.confidence - speaker.confidence);
    const weight = Math.min(MAX_CONCESSION, certaintyGap);
    const shifted = round2(before + (opponent.tilt[cls]! - before) * weight);

    /*
     * A concession too small to state is not a concession. Below the threshold
     * the desk holds its ground entirely, so the number on screen and the
     * sentence beside it say the same thing — the first run of this reported
     * "unresolved" while quietly moving the tilt by 0.03.
     */
    const after = Math.abs(shifted - before) >= MIN_CONCESSION ? shifted : before;
    speaker.tilt[cls] = after;

    exchanges.push({
      from: speaker.agentId,
      to: opponent.agentId,
      assetClass: cls,
      text: phrase(speaker, opponent, cls, before, after),
      before: round2(before),
      after,
    });
  }

  return { views: updated, exchanges };
}

/**
 * What the conceding desk says.
 *
 * Built from the opponent's own headline rather than a template about
 * "adjusting weights", so the argument on screen is the argument that actually
 * happened — the reader can see the reasoning that moved someone.
 */
function phrase(
  speaker: AgentView,
  opponent: AgentView,
  cls: AssetClass,
  before: number,
  after: number,
): string {
  const other = DESK_NAMES[opponent.agentId];
  const asset = LABELS[cls];
  const moved = after !== before;

  if (!moved) {
    return `${other} reads ${asset} differently — "${opponent.headline}" — but we are equally sure of our own reading, so this one goes to the strategist unresolved.`;
  }

  const direction = after > before ? "up" : "down";
  return `${other} makes the stronger case here: "${opponent.headline}". We are moving our ${asset} call ${direction}, from ${signed(before)} to ${signed(after)} — not all the way, because our own reading has not changed, only its weight against theirs.`;
}

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
