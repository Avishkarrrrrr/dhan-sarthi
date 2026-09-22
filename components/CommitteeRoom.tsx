"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Coins,
  Landmark,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TrendingUp,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Exchange as Exchange_ } from "@/lib/agents/debate";
import { ActionCard } from "./ActionCard";
import { TaxPanel } from "./TaxPanel";
import { useEffect, useRef, useState } from "react";
import type { AssetClass } from "@/lib/data/types";
import type {
  AgentId,
  Allocation,
  CommitteeEvent,
  ComplianceVerdict,
  EscalationTicket,
  FinalAnswer,
  InvestmentPolicyStatement,
  RiskProfile,
} from "@/lib/contracts/types";
import { streamCommittee } from "@/lib/client/api";
import { ruleLabel } from "@/lib/compliance/labels";
import { ASSET_LABELS } from "@/lib/format";

/**
 * The committee, as a room you watch.
 *
 * Every desk is seated before anyone speaks, so the shape of the decision is
 * visible from the start and each arriving view lands somewhere the eye is
 * already looking. The order is the argument: specialists, then a strategist
 * reconciling them, then compliance — which can overrule everything above it.
 */

/**
 * How long the room holds on each kind of event before moving on.
 *
 * These are reading times, not simulated work: a debate exchange quotes another
 * desk by name and moves a number, which takes longer to take in than a desk
 * simply lighting up. Total runtime is about eleven seconds; scale the whole
 * room by scaling these.
 */
const BEAT: Record<CommitteeEvent["type"], number> = {
  agent_start: 120,
  agent_view: 550,
  /*
   * An exchange gets the longest beat by some way, because it is the only
   * moment where three things have to land: the connector drawing between the
   * two desks, the line naming who is challenging whom, and the number moving.
   * At 1.4s all three happened, but they happened faster than they could be
   * taken in — the whole argument was over in four seconds. This is the part
   * of the room worth watching, so it is the part given time.
   */
  debate: 2300,
  strategist: 800,
  compliance: 900,
  hitl: 600,
  final: 0,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The desks, and what each one is looking at.
 *
 * `examines` is what the card says before anyone has spoken. Without it the
 * room opened as seven empty boxes — the largest thing on the screen, saying
 * nothing — and the method only became visible once you had already pressed
 * Convene. Stating the question each desk asks makes the idle state the
 * explanation it should always have been, and it is real: every line below
 * names the quantity that desk actually computes.
 *
 * Icons are line icons rather than emoji. Emoji render differently on every
 * platform, carry their own colour, and sit oddly in a bank's product.
 */
const DESKS: {
  id: AgentId;
  label: string;
  role: string;
  examines: string;
  Icon: LucideIcon;
}[] = [
  {
    id: "treasury",
    label: "Treasury",
    role: "Liquidity",
    examines: "Months of cover against a six-month buffer",
    Icon: Landmark,
  },
  {
    id: "markets",
    label: "Markets",
    role: "Trend",
    examines: "The Nifty against its four moving averages",
    Icon: TrendingUp,
  },
  {
    id: "macro",
    label: "Volatility",
    role: "Risk appetite",
    examines: "India VIX, and how much risk it argues for",
    Icon: Activity,
  },
  {
    id: "bonds",
    label: "Fixed income",
    role: "Horizon",
    examines: "How far the nearest goal is, and duration",
    Icon: CalendarClock,
  },
  {
    id: "gold",
    label: "Gold",
    role: "Hedging",
    examines: "Gold's weight against a 5% hedge",
    Icon: Coins,
  },
  {
    id: "behaviour",
    label: "Behaviour",
    role: "Cash flow",
    examines: "What actually reaches investments each month",
    Icon: Wallet,
  },
  {
    id: "tax",
    label: "Tax",
    role: "After-tax return",
    examines: "80C headroom and the drag on deposit interest",
    Icon: Receipt,
  },
];

type Seat = {
  status: "waiting" | "thinking" | "spoken";
  headline?: string;
  reasoning?: string;
  sources?: string[];
  confidence?: number;
  tilt?: Partial<Record<AssetClass, number>>;
};

type Phase = "idle" | "deliberating" | "debating" | "reconciling" | "vetting" | "done";

/**
 * Short forms for the tilt rows. The full labels ("Cash & Liquid") truncate to
 * "CASH & LI…" at this width, which is unreadable — and the row is about the
 * direction of the lean, so the label only has to identify the sleeve.
 */
/** Desk names, matching the seats above. */
const DESK_LABEL: Record<AgentId, string> = {
  treasury: "Treasury",
  markets: "Markets",
  macro: "Volatility",
  bonds: "Fixed income",
  gold: "Gold",
  behaviour: "Behaviour",
  tax: "Tax",
};

const SHORT_LABEL: Record<AssetClass, string> = {
  equity: "Equity",
  mutual_fund: "Funds",
  bonds: "Bonds",
  fd: "FD",
  gold: "Gold",
  cash: "Cash",
};

const CLASS_COLOUR: Record<AssetClass, string> = {
  equity: "#F43F5E",
  mutual_fund: "#818CF8",
  bonds: "#38BDF8",
  fd: "#2DD4BF",
  gold: "#FBBF24",
  cash: "#94A3B8",
};

export function CommitteeRoom({
  customerId,
  riskProfile,
  ips,
}: {
  customerId: string;
  riskProfile?: RiskProfile;
  /** The plan built by voice, when there is one. It grounds every desk. */
  ips?: InvestmentPolicyStatement;
}) {
  const [seats, setSeats] = useState<Record<string, Seat>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [exchanges, setExchanges] = useState<Exchange_[]>([]);
  const [verdict, setVerdict] = useState<ComplianceVerdict | null>(null);
  const [ticket, setTicket] = useState<EscalationTicket | null>(null);
  const [answer, setAnswer] = useState<FinalAnswer | null>(null);
  const [open, setOpen] = useState<AgentId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [skippable, setSkippable] = useState(false);
  /** The exchange currently playing out on the desk grid, if any. */
  const [live, setLive] = useState<Exchange_ | null>(null);

  /*
   * The deliberation has a time axis, and it is presentational only.
   *
   * The committee is deterministic and the whole NDJSON stream lands in a few
   * milliseconds, so without this every desk reported, argued, reconciled and
   * signed off inside one frame — the argument happened, but nobody could see
   * it happen. Events are queued here and applied one at a time with a beat
   * sized to what just arrived.
   *
   * Deliberately on the client: the generator and the route stay untouched, so
   * the decision remains reproducible, /api/committee stays fast, and if this
   * pacing ever misbehaves it cannot change what the committee decided.
   */
  const queued = useRef<CommitteeEvent[]>([]);
  const draining = useRef(false);
  const skipping = useRef(false);

  const running = phase !== "idle" && phase !== "done";

  const convene = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setSeats(Object.fromEntries(DESKS.map((d) => [d.id, { status: "waiting" as const }])));
    setPhase("deliberating");
    setAllocation(null);
    setExchanges([]);
    setLive(null);
    setVerdict(null);
    setTicket(null);
    setAnswer(null);
    setOpen(null);
    setError(null);

    queued.current = [];
    draining.current = false;
    skipping.current = false;
    setSkippable(true);

    const apply = (e: CommitteeEvent) => {
      switch (e.type) {
            case "agent_start":
              setSeats((s) => ({ ...s, [e.agentId]: { ...s[e.agentId], status: "thinking" } }));
              break;
            case "agent_view":
              setSeats((s) => ({
                ...s,
                [e.view.agentId]: {
                  status: "spoken",
                  headline: e.view.headline,
                  reasoning: e.view.reasoning,
                  sources: e.view.sources,
                  confidence: e.view.confidence,
                  tilt: e.view.tilt,
                },
              }));
              break;
            case "debate":
              setPhase("debating");
              setExchanges((x) => [...x, e.exchange]);
              /*
               * Also stage it on the grid, so the argument happens where the
               * desks are rather than only in a list underneath them. Cleared
               * by the next exchange, or when the strategist takes over.
               */
              setLive(e.exchange);
              break;
            case "strategist":
              setLive(null);
              setPhase("reconciling");
              setAllocation(e.allocation);
              break;
            case "compliance":
              setPhase("vetting");
              setVerdict(e.verdict);
              break;
            case "hitl":
              setTicket(e.ticket);
              break;
            case "final":
              setAnswer(e.answer);
              setPhase("done");
              break;
          }
    };

    /*
     * One drainer at a time, and it outlives the stream: the last few events
     * are still waiting their turn long after the response has closed. It stops
     * on abort, so switching customer mid-session cannot leave a second loop
     * writing into a room that has already been reset.
     */
    const drain = async () => {
      if (draining.current) return;
      draining.current = true;
      try {
        while (queued.current.length > 0) {
          if (controller.signal.aborted) return;
          const e = queued.current.shift()!;
          apply(e);
          const beat = skipping.current ? 0 : BEAT[e.type];
          if (beat > 0) await sleep(beat);
        }
      } finally {
        draining.current = false;
      }
    };

    try {
      await streamCommittee(
        customerId,
        (e) => {
          queued.current.push(e);
          void drain();
        },
        controller.signal,
        riskProfile,
        ips,
      );

      // The stream is done; the room is not. Let the queue finish emptying.
      while ((queued.current.length > 0 || draining.current) && !controller.signal.aborted) {
        await sleep(80);
        void drain();
      }
      setSkippable(false);
    } catch (err) {
      if (!controller.signal.aborted) {
        setSkippable(false);
        setError(err instanceof Error ? err.message : String(err));
        setPhase("idle");
      }
    }
  };

  const spoken = Object.values(seats).filter((s) => s.status === "spoken").length;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-brand-abyss via-brand-deep to-brand-abyss shadow-lift">
      {/* Header */}
      <div className="relative border-b border-white/10 px-4 py-3">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-brand-accent/20 blur-3xl"
        />
        <div className="relative flex items-center justify-between">
          {/*
            The eyebrow said "INVESTMENT COMMITTEE" above a heading that
            already said seven desks were involved — a tracked-out capital
            label repeating the line beneath it. The heading carries it alone,
            and the button gets its own lane so a two-line title no longer
            crowds it.
          */}
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="text-sm font-semibold leading-snug text-white">
              {phase === "idle" && "Seven desks, one recommendation"}
              {phase === "deliberating" && `Deliberating · ${spoken} of ${DESKS.length} reported`}
              {phase === "debating" && "The desks are arguing it out"}
              {phase === "reconciling" && "Strategist reconciling the views"}
              {phase === "vetting" && "Compliance reviewing the proposal"}
              {phase === "done" && "Decision recorded"}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/*
              A six-minute demo sometimes needs to jump, and a judge clicking
              around should never be held hostage by an animation. Skip empties
              the queue at once; it changes the pace, never the decision.
            */}
            {running && skippable && (
              <button
                onClick={() => {
                  skipping.current = true;
                }}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Skip
              </button>
            )}
            <button
              onClick={convene}
              disabled={running}
              className="rounded-full bg-brand-accent px-3.5 py-1.5 text-xs font-semibold text-brand-abyss shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
            >
              {running ? "In session…" : phase === "done" ? "Run again" : "Convene"}
            </button>
          </div>
        </div>

        <PhaseRail phase={phase} />
      </div>

      {error && (
        <p className="border-b border-white/10 bg-red-500/15 px-4 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}

      {/* The desks */}
      {/*
        The argument happens here, on the desks, not only in the list below
        them. While an exchange is live the two desks involved are ringed —
        challenger and challenged — and a line is drawn between their cards.
        Everything it draws is the data: `from`, `to`, and the tilt that moved.
      */}
      <div ref={grid} className="relative grid grid-cols-2 gap-2 p-3">
        <ExchangeLink grid={grid} live={live} />
        {DESKS.map((desk, i) => {
          const seat = seats[desk.id] ?? { status: "waiting" as const };
          return (
            <DeskCard
              key={desk.id}
              desk={desk}
              seat={seat}
              index={i}
              expanded={open === desk.id}
              onToggle={() => setOpen(open === desk.id ? null : desk.id)}
              challenging={live?.from === desk.id}
              challenged={live?.to === desk.id}
              live={live}
            />
          );
        })}
      </div>

      {/* What is being argued, in one line, while it happens */}
      <AnimatePresence>
        {live && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mx-3 -mt-1 flex items-center gap-1.5 rounded-lg bg-brand-glow/10 px-2.5 py-1.5 text-[11px]"
          >
            <span className="font-semibold text-brand-glow">{DESK_LABEL[live.from]}</span>
            <span className="text-white/45">challenges</span>
            <span className="font-semibold text-white/85">{DESK_LABEL[live.to]}</span>
            <span className="text-white/45">on</span>
            <span className="font-medium text-white/70">{SHORT_LABEL[live.assetClass]}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strategist */}
      <AnimatePresence>
        {allocation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 px-4 py-3"
          >
            <h4 className="mb-2 text-xs font-semibold text-white/70">Strategist&apos;s proposal</h4>
            <AllocationBar allocation={allocation} />
            <p className="mt-2 text-[11px] leading-relaxed text-white/70">{allocation.rationale}</p>
            <div className="mt-2 flex gap-4 text-[10px] text-white/45">
              <span>Expected return {allocation.expectedReturnPct}%</span>
              <span>Volatility {allocation.volatilityPct}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compliance */}
      <AnimatePresence>
        {verdict && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`border-t px-4 py-3 ${
              verdict.status === "block"
                ? "border-red-400/30 bg-red-500/10"
                : verdict.status === "rewrite"
                  ? "border-amber-400/30 bg-amber-500/10"
                  : "border-brand-accent/25 bg-brand-accent/10"
            }`}
          >
            {/*
              The verdict reads as an institution signing something, not as
              another message in a thread: an icon, the status as the largest
              thing in the block, and the reasoning beneath it.
            */}
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  verdict.status === "block"
                    ? "bg-red-400/20 text-red-200"
                    : verdict.status === "rewrite"
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-brand-glow/20 text-brand-glow"
                }`}
              >
                {verdict.status === "block" ? (
                  <ShieldX className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                ) : verdict.status === "rewrite" ? (
                  <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                ) : (
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-white">
                  {verdict.status === "pass"
                    ? "Cleared by compliance"
                    : verdict.status === "rewrite"
                      ? "Adjusted by compliance"
                      : "Blocked by compliance"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/75">
                  {verdict.explanation}
                </p>
              </div>
            </div>

            {verdict.violations.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {verdict.violations.slice(0, 6).map((v, i) => (
                  <li
                    key={`${v.rule}-${i}`}
                    className="flex items-center gap-1.5 text-[11px] text-white/65"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        v.severity === "high"
                          ? "bg-red-300"
                          : v.severity === "med"
                            ? "bg-amber-300"
                            : "bg-white/35"
                      }`}
                      aria-hidden
                    />
                    {ruleLabel(v.rule)}
                  </li>
                ))}
              </ul>
            )}

            {ticket && (
              <a
                href="/rm"
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-2 text-[11px] text-white/75 transition-colors hover:bg-white/10"
              >
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-brand-glow" strokeWidth={1.75} aria-hidden />
                <span className="flex-1">Waiting for a relationship manager to sign</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-white/40" strokeWidth={2} aria-hidden />
              </a>
            )}

            {/*
              Reference numbers belong at the foot in small type, not inside a
              sentence. They matter to an auditor, not to the customer reading
              the verdict.
            */}
            {(ticket || answer) && (
              <p className="mt-2 font-mono text-[9px] tabular-nums text-white/25">
                {ticket && <>Ref {ticket.id}</>}
                {ticket && answer && " · "}
                {answer && <>Audit {answer.auditId}</>}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        The customer's own gate. Deliberately below the compliance verdict and
        above nothing else: they approve what the bank is willing to recommend,
        not the proposal compliance refused.
      */}
      {/*
        The argument. Shown between the desks and the strategist because that
        is where it happens — a committee that never visibly disagrees is a
        committee nobody believes met.
      */}
      {exchanges.length > 0 && (
        <div className="mt-3 space-y-2">
          <h4 className="text-xs font-semibold text-white/70">Where they disagreed</h4>
          {exchanges.map((x, i) => (
            <Exchange key={`${x.from}-${x.assetClass}-${i}`} x={x} index={i} />
          ))}
        </div>
      )}

      {answer?.tax && (
        <div className="mt-3">
          <TaxPanel tax={answer.tax} />
        </div>
      )}

      {answer && answer.actions?.length > 0 && (
        <div className="mt-3">
          <ActionCard actions={answer.actions} auditId={answer.auditId} escalated={!!ticket} />
        </div>
      )}
    </section>
  );
}

/**
 * The line drawn between two arguing desks.
 *
 * Positions are measured rather than assumed, because the grid reflows — a desk
 * expands when tapped, and the cards are not a fixed height. The measurement is
 * taken when the live exchange changes and the line is drawn in an overlay that
 * ignores pointer events, so it can never sit between a finger and a card.
 */
function ExchangeLink({
  grid,
  live,
}: {
  grid: React.RefObject<HTMLDivElement | null>;
  live: Exchange_ | null;
}) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!live || !grid.current) {
      setLine(null);
      return;
    }
    const box = grid.current.getBoundingClientRect();
    const from = grid.current.querySelector<HTMLElement>(`[data-desk="${live.from}"]`);
    const to = grid.current.querySelector<HTMLElement>(`[data-desk="${live.to}"]`);
    if (!from || !to) {
      setLine(null);
      return;
    }
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    setLine({
      x1: a.left - box.left + a.width / 2,
      y1: a.top - box.top + a.height / 2,
      x2: b.left - box.left + b.width / 2,
      y2: b.top - box.top + b.height / 2,
    });
  }, [live, grid]);

  return (
    <AnimatePresence>
      {line && (
        <motion.svg
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden
        >
          <defs>
            <marker id="ds-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" fill="#3DE0A8" />
            </marker>
          </defs>
          <motion.line
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#3DE0A8"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeOpacity="0.8"
            markerEnd="url(#ds-arrow)"
          />
        </motion.svg>
      )}
    </AnimatePresence>
  );
}

/**
 * One exchange in the argument.
 *
 * The card used to lead with the prose and tuck the numbers into a small
 * right-aligned monospace run. That was backwards twice over: the movement is
 * the whole point of an exchange, and the sentences are generated from a
 * template, so three of them stacked up repeated the same clause word for word
 * and the section read like a mail merge rather than an argument.
 *
 * So the move leads — who challenged whom, over what, and the number before
 * and after, on a track that shows the distance travelled. The reasoning is
 * still there, one tap away, for anyone who wants it. Nothing is hidden that a
 * regulator would need; it is just no longer shouting over the finding.
 */
function Exchange({ x, index }: { x: Exchange_; index: number }) {
  const [open, setOpen] = useState(false);
  const moved = x.after !== x.before;
  const up = x.after > x.before;

  // Tilts run -1..1, so the track maps that range onto its width.
  const pos = (v: number) => `${((v + 1) / 2) * 100}%`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-brand-glow">{DESK_LABEL[x.from]}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-white/30" strokeWidth={2} aria-hidden />
          <span className="font-semibold text-white/85">{DESK_LABEL[x.to]}</span>
          <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/60">
            {SHORT_LABEL[x.assetClass]}
          </span>
        </div>

        {/* The move itself, on a track from -1 to +1 */}
        <div className="mt-2 flex items-center gap-2">
          <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/40">
            {x.before > 0 ? "+" : ""}
            {x.before.toFixed(2)}
          </span>
          <span className="relative h-1 flex-1 rounded-full bg-white/10">
            <span className="absolute inset-y-0 w-px bg-white/20" style={{ left: "50%" }} />
            {moved && (
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(x.after - x.before) / 2) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.1 + 0.2 }}
                className={`absolute inset-y-0 rounded-full ${up ? "bg-brand-glow" : "bg-signal-down"}`}
                style={up ? { left: pos(x.before) } : { right: `calc(100% - ${pos(x.before)})` }}
              />
            )}
            <span
              className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                moved ? (up ? "bg-brand-glow" : "bg-signal-down") : "bg-white/40"
              }`}
              style={{ left: pos(x.after) }}
            />
          </span>
          <span
            className={`w-9 shrink-0 font-mono text-[10px] font-semibold tabular-nums ${
              moved ? (up ? "text-brand-glow" : "text-signal-down") : "text-white/45"
            }`}
          >
            {x.after > 0 ? "+" : ""}
            {x.after.toFixed(2)}
          </span>
        </div>

        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-white/40">
          {moved ? "Moved its call" : "Held its ground"}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
            aria-hidden
          />
        </p>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="border-t border-white/10 px-3 py-2.5 text-[11px] leading-relaxed text-white/70">
              {x.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** The four stages, so it is obvious what has happened and what is still to come. */
function PhaseRail({ phase }: { phase: Phase }) {
  /*
   * Stage names are verbs where a verb reads better, and all of them are short
   * enough to sit in a fifth of a phone's width. "Strategist" and "Compliance"
   * set in tracked-out capitals overran their columns and collided.
   */
  const STAGES: { key: Phase; label: string }[] = [
    { key: "deliberating", label: "Desks" },
    { key: "debating", label: "Debate" },
    { key: "reconciling", label: "Reconcile" },
    { key: "vetting", label: "Checks" },
    { key: "done", label: "Answer" },
  ];
  const order: Phase[] = ["idle", "deliberating", "debating", "reconciling", "vetting", "done"];
  const at = order.indexOf(phase);

  return (
    <div className="relative mt-3 flex items-center gap-1.5">
      {STAGES.map((s) => {
        const idx = order.indexOf(s.key);
        const reached = at >= idx;
        const active = phase === s.key;
        return (
          <div key={s.key} className="flex flex-1 flex-col gap-1">
            <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: reached ? "100%" : "0%" }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`h-full ${active ? "bg-brand-glow" : "bg-brand-accent/70"}`}
              />
            </div>
            <span
              className={`truncate text-[9px] ${
                reached ? "text-brand-glow/80" : "text-white/25"
              }`}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DeskCard({
  desk,
  seat,
  index,
  expanded,
  onToggle,
  challenging = false,
  challenged = false,
  live = null,
}: {
  desk: (typeof DESKS)[number];
  seat: Seat;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  /** This desk is making the argument. */
  challenging?: boolean;
  /** This desk is the one being argued with. */
  challenged?: boolean;
  live?: Exchange_ | null;
}) {
  const spoken = seat.status === "spoken";
  const thinking = seat.status === "thinking";
  const inExchange = challenging || challenged;

  return (
    <motion.button
      layout
      onClick={spoken ? onToggle : undefined}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, scale: inExchange ? 1.015 : 1 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
        spoken
          ? "border-white/15 bg-white/[0.07]"
          : thinking
            ? "border-brand-glow/40 bg-white/[0.05]"
            : "border-white/5 bg-white/[0.02]"
      } ${
        challenging
          ? "!border-brand-glow/70 ring-1 ring-brand-glow/40"
          : challenged
            ? "!border-white/45 ring-1 ring-white/20"
            : ""
      } ${expanded ? "col-span-2" : ""}`}
      data-desk={desk.id}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
            spoken ? "bg-brand-glow/15 text-brand-glow" : "bg-white/10 text-white/50"
          }`}
        >
          <desk.Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {thinking && (
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-brand-glow" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold leading-tight text-white">
            {desk.label}
          </span>
          <span className="block truncate text-[9px] text-white/35">{desk.role}</span>
        </span>
        {spoken && seat.confidence !== undefined && <ConfidenceDial value={seat.confidence} />}
      </div>

      {/*
        Before anyone speaks the card says what this desk will look at, in
        lighter type. Seven empty boxes were the largest thing on the screen
        and the least informative; the question each desk asks is worth reading
        on its own, and it makes the answer that replaces it legible.
      */}
      <p
        className={`mt-1.5 min-h-[30px] text-[10px] leading-snug ${
          spoken ? "text-white/70" : "text-white/40"
        }`}
      >
        {thinking ? (
          <span className="inline-block h-2.5 w-3/4 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.18),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
        ) : spoken ? (
          seat.headline
        ) : (
          desk.examines
        )}
      </p>

      {spoken && seat.tilt && <TiltStrip tilt={seat.tilt} />}

      <AnimatePresence>
        {expanded && spoken && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/65">
              {seat.reasoning}
            </p>
            {seat.sources && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {seat.sources.map((s) => (
                  <span key={s} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/55">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** A small ring — reads faster than a percentage at this size. */
function ConfidenceDial({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative flex h-6 w-6 shrink-0 items-center justify-center"
      title={`${Math.round(value * 100)}% confidence`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
        <motion.circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="#3DE0A8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-[7px] font-bold text-white/80">{Math.round(value * 100)}</span>
    </span>
  );
}

/** Which way this desk is leaning, and how hard. */
function TiltStrip({ tilt }: { tilt: Partial<Record<AssetClass, number>> }) {
  const entries = (Object.entries(tilt) as [AssetClass, number][])
    .filter(([, v]) => Math.abs(v) > 0.02)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 3);
  if (!entries.length) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {entries.map(([c, v]) => (
        <div key={c} className="flex items-center gap-1.5">
          <span className="w-[42px] shrink-0 text-[9px] text-white/45">
            {SHORT_LABEL[c]}
          </span>
          {/* Centre line with the bar growing left (under) or right (over) */}
          <span className="relative h-1 flex-1 rounded-full bg-white/8">
            <span className="absolute left-1/2 top-1/2 h-2 w-px -translate-y-1/2 bg-white/20" />
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(50, Math.abs(v) * 50)}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`absolute top-0 h-1 rounded-full ${v > 0 ? "left-1/2 bg-signal-up" : "right-1/2 bg-signal-down"}`}
            />
          </span>
          <span className={`w-7 shrink-0 text-right font-mono text-[8px] ${v > 0 ? "text-signal-up" : "text-signal-down"}`}>
            {v > 0 ? "+" : ""}
            {v.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AllocationBar({ allocation }: { allocation: Allocation }) {
  const parts = (Object.entries(allocation.weights) as [AssetClass, number][])
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
        {parts.map(([c, w], i) => (
          <motion.div
            key={c}
            initial={{ width: 0 }}
            animate={{ width: `${w * 100}%` }}
            transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: CLASS_COLOUR[c] }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map(([c, w]) => (
          <span key={c} className="flex items-center gap-1 text-[10px] text-white/60">
            <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOUR[c] }} />
            {ASSET_LABELS[c]} {Math.round(w * 100)}%
          </span>
        ))}
      </div>
    </>
  );
}
