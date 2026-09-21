"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ActionCard } from "./ActionCard";
import { TaxPanel } from "./TaxPanel";
import { useRef, useState } from "react";
import type { AssetClass } from "@/lib/data/types";
import type {
  AgentId,
  Allocation,
  ComplianceVerdict,
  EscalationTicket,
  FinalAnswer,
  InvestmentPolicyStatement,
  RiskProfile,
} from "@/lib/contracts/types";
import { streamCommittee } from "@/lib/client/api";
import { ASSET_LABELS } from "@/lib/format";

/**
 * The committee, as a room you watch.
 *
 * Every desk is seated before anyone speaks, so the shape of the decision is
 * visible from the start and each arriving view lands somewhere the eye is
 * already looking. The order is the argument: specialists, then a strategist
 * reconciling them, then compliance — which can overrule everything above it.
 */

const DESKS: { id: AgentId; label: string; role: string; icon: string }[] = [
  { id: "treasury", label: "Treasury", role: "Liquidity", icon: "🏦" },
  { id: "markets", label: "Markets", role: "Trend", icon: "📈" },
  { id: "macro", label: "Volatility", role: "Risk appetite", icon: "🌊" },
  { id: "bonds", label: "Fixed income", role: "Horizon", icon: "📋" },
  { id: "gold", label: "Gold", role: "Hedging", icon: "🥇" },
  { id: "behaviour", label: "Behaviour", role: "Cash flow", icon: "🧭" },
  { id: "tax", label: "Tax", role: "After-tax return", icon: "🧾" },
];

type Seat = {
  status: "waiting" | "thinking" | "spoken";
  headline?: string;
  reasoning?: string;
  sources?: string[];
  confidence?: number;
  tilt?: Partial<Record<AssetClass, number>>;
};

type Phase = "idle" | "deliberating" | "reconciling" | "vetting" | "done";

/**
 * Short forms for the tilt rows. The full labels ("Cash & Liquid") truncate to
 * "CASH & LI…" at this width, which is unreadable — and the row is about the
 * direction of the lean, so the label only has to identify the sleeve.
 */
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
  const [verdict, setVerdict] = useState<ComplianceVerdict | null>(null);
  const [ticket, setTicket] = useState<EscalationTicket | null>(null);
  const [answer, setAnswer] = useState<FinalAnswer | null>(null);
  const [open, setOpen] = useState<AgentId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const running = phase !== "idle" && phase !== "done";

  const convene = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setSeats(Object.fromEntries(DESKS.map((d) => [d.id, { status: "waiting" as const }])));
    setPhase("deliberating");
    setAllocation(null);
    setVerdict(null);
    setTicket(null);
    setAnswer(null);
    setOpen(null);
    setError(null);

    try {
      await streamCommittee(
        customerId,
        (e) => {
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
            case "strategist":
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
        },
        controller.signal,
        riskProfile,
        ips,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
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
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-glow/70">
              Investment committee
            </p>
            <h3 className="text-sm font-semibold text-white">
              {phase === "idle" && "Seven desks, one recommendation"}
              {phase === "deliberating" && `Deliberating · ${spoken} of ${DESKS.length} reported`}
              {phase === "reconciling" && "Strategist reconciling the views"}
              {phase === "vetting" && "Compliance reviewing the proposal"}
              {phase === "done" && "Decision recorded"}
            </h3>
          </div>
          <button
            onClick={convene}
            disabled={running}
            className="rounded-full bg-brand-accent px-3.5 py-1.5 text-xs font-semibold text-brand-abyss shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
          >
            {running ? "In session…" : phase === "done" ? "Run again" : "Convene"}
          </button>
        </div>

        <PhaseRail phase={phase} />
      </div>

      {error && (
        <p className="border-b border-white/10 bg-red-500/15 px-4 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}

      {/* The desks */}
      <div className="grid grid-cols-2 gap-2 p-3">
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
            />
          );
        })}
      </div>

      {/* Strategist */}
      <AnimatePresence>
        {allocation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 px-4 py-3"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-glow/70">
              Strategist&apos;s proposal
            </p>
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
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                Compliance review
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  verdict.status === "block"
                    ? "bg-red-400/25 text-red-100"
                    : verdict.status === "rewrite"
                      ? "bg-amber-400/25 text-amber-100"
                      : "bg-brand-glow/25 text-brand-glow"
                }`}
              >
                {verdict.status === "pass" ? "Cleared" : verdict.status === "rewrite" ? "Adjusted" : "Blocked"}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-white/80">{verdict.explanation}</p>

            {verdict.violations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {verdict.violations.slice(0, 6).map((v, i) => (
                  <span
                    key={`${v.rule}-${i}`}
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${
                      v.severity === "high"
                        ? "bg-red-400/20 text-red-100"
                        : v.severity === "med"
                          ? "bg-amber-400/20 text-amber-100"
                          : "bg-white/10 text-white/55"
                    }`}
                  >
                    {v.rule}
                  </span>
                ))}
              </div>
            )}

            {ticket && (
              <p className="mt-2 text-[11px] text-white/70">
                Referred to a relationship manager as{" "}
                <span className="font-mono text-white">{ticket.id}</span>{" "}
                <a
                  href="/rm"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-glow underline underline-offset-2"
                >
                  open the queue →
                </a>
              </p>
            )}
            {answer && (
              <p className="mt-1.5 font-mono text-[10px] text-white/35">Audit {answer.auditId}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        The customer's own gate. Deliberately below the compliance verdict and
        above nothing else: they approve what the bank is willing to recommend,
        not the proposal compliance refused.
      */}
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

/** The four stages, so it is obvious what has happened and what is still to come. */
function PhaseRail({ phase }: { phase: Phase }) {
  const STAGES: { key: Phase; label: string }[] = [
    { key: "deliberating", label: "Desks" },
    { key: "reconciling", label: "Strategist" },
    { key: "vetting", label: "Compliance" },
    { key: "done", label: "Answer" },
  ];
  const order: Phase[] = ["idle", "deliberating", "reconciling", "vetting", "done"];
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
              className={`text-[9px] uppercase tracking-wide ${
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
}: {
  desk: (typeof DESKS)[number];
  seat: Seat;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const spoken = seat.status === "spoken";
  const thinking = seat.status === "thinking";

  return (
    <motion.button
      layout
      onClick={spoken ? onToggle : undefined}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
        spoken
          ? "border-white/15 bg-white/[0.07]"
          : thinking
            ? "border-brand-glow/40 bg-white/[0.05]"
            : "border-white/5 bg-white/[0.02]"
      } ${expanded ? "col-span-2" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px]">
          {desk.icon}
          {thinking && (
            <span className="absolute inset-0 animate-pulse-ring rounded-full border border-brand-glow" />
          )}
        </span>
        <span className="flex-1">
          <span className="block text-[11px] font-semibold leading-tight text-white">{desk.label}</span>
          <span className="block text-[9px] uppercase tracking-wide text-white/35">{desk.role}</span>
        </span>
        {spoken && seat.confidence !== undefined && <ConfidenceDial value={seat.confidence} />}
      </div>

      <p className="mt-1.5 min-h-[26px] text-[10px] leading-snug text-white/70">
        {thinking ? (
          <span className="inline-block h-2.5 w-3/4 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.18),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
        ) : (
          seat.headline
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
          <span className="w-[42px] shrink-0 text-[8px] uppercase tracking-wide text-white/45">
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
