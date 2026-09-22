"use client";

import { useState } from "react";
import type { AssetClass } from "@/lib/data/types";
import type {
  Allocation,
  InvestmentPolicyStatement,
  RiskProfile,
  Severity,
  Violation,
} from "@/lib/contracts/types";
import { postCompliance, type ComplianceResponse } from "@/lib/client/api";
import { CommitteeRoom } from "./CommitteeRoom";
import { VoiceInterview } from "./VoiceInterview";
import { Mic } from "lucide-react";
import { ASSET_LABELS, inr } from "@/lib/format";

/**
 * The trust layer, on screen.
 *
 * Everything here runs against the same deterministic rules engine the advisor
 * uses — nothing is staged. The two presets exist because a compliance layer
 * is only convincing when you can watch it refuse something: the suitable
 * proposal passes, the aggressive pitch is blocked, and the block arrives with
 * a compliant alternative rather than a dead end.
 */

interface Preset {
  id: string;
  label: string;
  blurb: string;
  allocation: Allocation;
}

/**
 * Adversarial proposals, kept deliberately.
 *
 * The committee's own output is vetted live above; these exist to prove the
 * checks bite on something the committee would never produce. They are the
 * only fabricated allocations in the product, and they are labelled as tests.
 */
const PRESETS: Preset[] = [
  {
    id: "pitch",
    label: "Aggressive pitch",
    blurb: "All-in on equity, with a guaranteed-returns claim",
    allocation: {
      weights: { equity: 0.7, mutual_fund: 0.3, bonds: 0, fd: 0, gold: 0, cash: 0 },
      expectedReturnPct: 24,
      volatilityPct: 3,
      rationale:
        "Go all-in on equities now — this is a guaranteed way to double your money before the home purchase.",
      contributingViews: ["markets"],
    },
  },
  {
    id: "leveraged",
    label: "Leveraged position",
    blurb: "A short bond leg funding extra equity",
    allocation: {
      weights: { equity: 0.55, mutual_fund: 0.4, bonds: -0.15, fd: 0.1, gold: 0.05, cash: 0.05 },
      expectedReturnPct: 19,
      volatilityPct: 16,
      rationale: "Borrow against the bond sleeve to fund a larger equity position.",
      contributingViews: ["markets"],
    },
  },
];

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-red-100 text-red-700",
  med: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const STATUS_STYLE: Record<ComplianceResponse["status"], { chip: string; label: string }> = {
  pass: { chip: "bg-brand-green/10 text-brand-green", label: "Approved" },
  rewrite: { chip: "bg-amber-100 text-amber-700", label: "Adjusted before advising" },
  block: { chip: "bg-red-100 text-red-700", label: "Blocked" },
};

export function TrustPanel({ customerId, riskProfile }: { customerId: string; riskProfile?: RiskProfile }) {
  /*
   * Stage 2, before stage 3. The committee can run on the plan inferred from
   * the customer's goals on file, but it is a far better answer when it runs
   * on the plan they described out loud — so the interview sits above it and
   * says so, rather than being buried somewhere they would never find it.
   */
  const [interviewing, setInterviewing] = useState(false);
  const [ips, setIps] = useState<InvestmentPolicyStatement | undefined>();
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [verdict, setVerdict] = useState<ComplianceResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS.find((p) => p.id === presetId)!;

  const run = async () => {
    setRunning(true);
    setError(null);
    setVerdict(null);
    try {
      setVerdict(
        await postCompliance({
          allocation: preset.allocation,
          customerId,
          spokenText: preset.allocation.rationale,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-24">
      <header>
        <h2 className="text-base font-semibold text-brand-deep">Advice &amp; suitability</h2>
        <p className="mt-0.5 text-xs text-ink/60">
          Every recommendation is vetted against the firm&apos;s suitability limits before it reaches you.
          The checks are deterministic — the same proposal is judged the same way every time.
        </p>
      </header>

      {interviewing ? (
        <section className="overflow-hidden rounded-2xl border border-brand-light bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-brand-light px-4 py-2.5">
            <p className="text-sm font-semibold text-brand-deep">Building your plan</p>
            <button
              onClick={() => setInterviewing(false)}
              className="text-xs font-medium text-ink/50 hover:text-ink/80"
            >
              Close
            </button>
          </div>
          <div className="h-[26rem]">
            <VoiceInterview
              customerId={customerId}
              onComplete={(plan) => {
                setIps(plan);
                // Straight back to the committee: the plan exists to be acted
                // on, and making them find their way back would waste it.
                setTimeout(() => setInterviewing(false), 2200);
              }}
            />
          </div>
        </section>
      ) : (
        <PlanBar ips={ips} onStart={() => setInterviewing(true)} />
      )}

      <CommitteeRoom customerId={customerId} riskProfile={riskProfile} ips={ips} />

      {/* Adversarial proposals, to show the checks bite */}
      <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
          Test the guardrails
        </p>
        <p className="mb-2 text-[11px] text-ink/55">
          Proposals the committee would never make, run through the same checks.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPresetId(p.id);
                setVerdict(null);
              }}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                p.id === presetId ? "border-brand-green bg-brand-green/5" : "border-brand-light bg-white"
              }`}
            >
              <span className="font-semibold text-ink">{p.label}</span>
              <span className="mt-0.5 block text-[10px] leading-tight text-ink/50">{p.blurb}</span>
            </button>
          ))}
        </div>

        <WeightBar allocation={preset.allocation} />

        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[11px] italic leading-relaxed text-ink/70">
          “{preset.allocation.rationale}”
        </p>
        <p className="mt-1.5 text-[10px] text-ink/45">
          Claimed return {preset.allocation.expectedReturnPct}% · volatility {preset.allocation.volatilityPct}%
        </p>

        <button
          onClick={run}
          disabled={running}
          className="mt-3 w-full rounded-xl bg-brand-deep py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {running ? "Checking suitability…" : "Run compliance check"}
        </button>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-[11px] text-red-700">
          Compliance check failed: {error}
        </div>
      )}

      {verdict && <Verdict verdict={verdict} />}
    </div>
  );
}

function Verdict({ verdict }: { verdict: ComplianceResponse }) {
  const style = STATUS_STYLE[verdict.status];
  const counts = countBy(verdict.violations);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Headline */}
      <section
        className={`rounded-2xl border p-4 shadow-soft ${
          verdict.status === "block"
            ? "border-red-200 bg-red-50/60"
            : verdict.status === "rewrite"
              ? "border-amber-200 bg-amber-50/60"
              : "border-brand-green/30 bg-brand-green/5"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">Verdict</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.chip}`}>
            {style.label}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-ink">{verdict.explanation}</p>
      </section>

      {/* Violations */}
      {verdict.violations.length > 0 && (
        <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
              {verdict.violations.length} finding{verdict.violations.length === 1 ? "" : "s"}
            </p>
            <div className="flex gap-1">
              {(["high", "med", "low"] as Severity[])
                .filter((s) => counts[s])
                .map((s) => (
                  <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_STYLE[s]}`}>
                    {counts[s]} {s}
                  </span>
                ))}
            </div>
          </div>
          <ul className="space-y-2">
            {verdict.violations.map((v, i) => (
              <li key={`${v.rule}-${i}`} className="border-l-2 border-brand-light pl-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${SEVERITY_STYLE[v.severity]}`}>
                    {v.severity}
                  </span>
                  <span className="font-mono text-[10px] text-ink/40">{v.rule}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-ink/75">{v.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The compliant alternative */}
      {verdict.rewritten && (
        <section className="rounded-2xl border border-brand-green/30 bg-white p-4 shadow-soft">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand-green">
            What we can recommend instead
          </p>
          <WeightBar allocation={verdict.rewritten} />
          <p className="mt-2 text-[10px] text-ink/50">
            Expected return {verdict.rewritten.expectedReturnPct}% · volatility {verdict.rewritten.volatilityPct}%
          </p>
        </section>
      )}

      {/* Escalation + audit */}
      <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink/45">Governance</p>
        <div className="space-y-1.5 text-[11px]">
          {verdict.ticket ? (
            <p>
              <span className="text-ink/50">Escalated to a relationship manager: </span>
              <span className="font-mono text-ink">{verdict.ticket.id}</span>
              <span className="text-ink/50"> ({verdict.ticket.reason.replace(/_/g, " ")}, {verdict.ticket.status})</span>
              {" "}
              <a
                href="/rm"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-green underline underline-offset-2"
              >
                open the RM queue →
              </a>
            </p>
          ) : (
            <p className="text-ink/50">No human escalation needed — within straight-through limits.</p>
          )}
          <p>
            <span className="text-ink/50">Audit record: </span>
            <span className="font-mono text-ink">{verdict.auditId}</span>
          </p>
        </div>
        <p className="mt-2 border-t border-brand-light pt-2 text-[10px] leading-relaxed text-ink/45">
          Every decision is logged with the proposal, the findings and what was said, so any recommendation
          can be reconstructed later.
        </p>
      </section>
    </div>
  );
}

/** A single stacked bar of the allocation — quicker to read than six numbers. */
function WeightBar({ allocation }: { allocation: Allocation }) {
  const COLOURS: Record<AssetClass, string> = {
    equity: "bg-rose-400",
    mutual_fund: "bg-indigo-400",
    bonds: "bg-sky-400",
    fd: "bg-teal-400",
    gold: "bg-amber-400",
    cash: "bg-slate-300",
  };
  const parts = (Object.entries(allocation.weights) as [AssetClass, number][])
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface">
        {parts.map(([c, w]) => (
          <div key={c} className={COLOURS[c]} style={{ width: `${w * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map(([c, w]) => (
          <span key={c} className="flex items-center gap-1 text-[10px] text-ink/60">
            <span className={`h-2 w-2 rounded-full ${COLOURS[c]}`} />
            {ASSET_LABELS[c]} {Math.round(w * 100)}%
          </span>
        ))}
      </div>
    </>
  );
}

function countBy(violations: Violation[]): Record<Severity, number> {
  return violations.reduce(
    (acc, v) => ({ ...acc, [v.severity]: (acc[v.severity] ?? 0) + 1 }),
    { high: 0, med: 0, low: 0 } as Record<Severity, number>,
  );
}

/**
 * Either an invitation to describe the plan, or the plan itself.
 *
 * Shown as a strip rather than a panel: before the interview it is a single
 * call to action, and afterwards it is the one-line summary of what the
 * committee is now working from.
 */
function PlanBar({
  ips,
  onStart,
}: {
  ips?: InvestmentPolicyStatement;
  onStart: () => void;
}) {
  if (!ips) {
    return (
      <button
        onClick={onStart}
        className="flex w-full items-center gap-3 rounded-2xl border border-brand-green/30 bg-white p-4 text-left shadow-soft transition-colors hover:bg-brand-green/5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
          <Mic className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-deep">
            Tell me what you are planning for
          </span>
          <span className="block text-[11px] leading-relaxed text-ink/55">
            Eight questions, by voice or typed. Everything below is grounded in your answers.
          </span>
        </span>
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-green/30 bg-brand-light/40 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-deep">Your plan</p>
        <button onClick={onStart} className="text-[11px] font-medium text-brand-green">
          Change
        </button>
      </div>
      <p className="text-xs leading-relaxed text-ink/70">
        {inr(ips.monthlySip)} a month
        {ips.annualStepUpPct > 0 && `, rising ${ips.annualStepUpPct}% a year`}, for{" "}
        {ips.horizonYears} years, towards {inr(ips.targetCorpus)} — as a {ips.riskProfile}{" "}
        investor.
      </p>
    </section>
  );
}
