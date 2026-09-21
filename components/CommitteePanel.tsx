"use client";

import { useRef, useState } from "react";
import type { AssetClass } from "@/lib/data/types";
import type {
  AgentId,
  Allocation,
  ComplianceVerdict,
  EscalationTicket,
  FinalAnswer,
} from "@/lib/contracts/types";
import { streamCommittee } from "@/lib/client/api";
import { ASSET_LABELS } from "@/lib/format";

/**
 * The investment committee, live.
 *
 * Six desks each give a view on the customer's actual position and the current
 * market, a strategist fuses them into one allocation, and only then does
 * compliance see it. Streaming matters here: watching the vetting step arrive
 * *after* a proposal — and sometimes overrule it — is the part that reads as
 * governance rather than decoration.
 */

const DESK: Record<AgentId, { label: string; icon: string }> = {
  treasury: { label: "Treasury", icon: "🏦" },
  markets: { label: "Markets", icon: "📈" },
  macro: { label: "Volatility", icon: "🌊" },
  bonds: { label: "Fixed income", icon: "📋" },
  gold: { label: "Gold", icon: "🥇" },
  behaviour: { label: "Behaviour", icon: "🧭" },
};

type ViewState = {
  agentId: AgentId;
  status: "thinking" | "done";
  headline?: string;
  reasoning?: string;
  sources?: string[];
  confidence?: number;
  tilt?: Partial<Record<AssetClass, number>>;
};

export function CommitteePanel({ customerId }: { customerId: string }) {
  const [views, setViews] = useState<ViewState[]>([]);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [verdict, setVerdict] = useState<ComplianceVerdict | null>(null);
  const [ticket, setTicket] = useState<EscalationTicket | null>(null);
  const [answer, setAnswer] = useState<FinalAnswer | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<AgentId | null>(null);
  const abort = useRef<AbortController | null>(null);

  const convene = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setRunning(true);
    setError(null);
    setViews([]);
    setAllocation(null);
    setVerdict(null);
    setTicket(null);
    setAnswer(null);

    try {
      await streamCommittee(
        customerId,
        (e) => {
          switch (e.type) {
            case "agent_start":
              setViews((v) => [...v, { agentId: e.agentId, status: "thinking" }]);
              break;
            case "agent_view":
              setViews((v) =>
                v.map((x) =>
                  x.agentId === e.view.agentId
                    ? { ...x, status: "done", ...e.view }
                    : x,
                ),
              );
              break;
            case "strategist":
              setAllocation(e.allocation);
              break;
            case "compliance":
              setVerdict(e.verdict);
              break;
            case "hitl":
              setTicket(e.ticket);
              break;
            case "final":
              setAnswer(e.answer);
              break;
          }
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-green/10 text-sm">⚖️</span>
        <h3 className="text-sm font-semibold text-brand-deep">Investment committee</h3>
      </div>
      <p className="mb-3 text-xs text-ink/60">
        Six desks review your position and today&apos;s market, a strategist reconciles them, and
        compliance vets the result before it reaches you.
      </p>

      <button
        onClick={convene}
        disabled={running}
        className="w-full rounded-xl bg-brand-deep py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {running ? "Committee in session…" : "Convene the committee"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>
      )}

      {views.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {views.map((v) => {
            const desk = DESK[v.agentId];
            const open = expanded === v.agentId;
            return (
              <li key={v.agentId} className="rounded-xl bg-surface px-3 py-2">
                <button
                  onClick={() => setExpanded(open ? null : v.agentId)}
                  disabled={v.status !== "done"}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span className="text-sm leading-5">{desk.icon}</span>
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-ink">{desk.label}</span>
                      {v.status === "done" && v.confidence !== undefined && (
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] text-ink/50">
                          {Math.round(v.confidence * 100)}% confidence
                        </span>
                      )}
                    </span>
                    {v.status === "thinking" ? (
                      <span className="mt-0.5 block text-[11px] text-ink/40">reviewing…</span>
                    ) : (
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink/70">{v.headline}</span>
                    )}
                  </span>
                  {v.status === "done" && (
                    <span className="text-[10px] text-ink/35">{open ? "−" : "+"}</span>
                  )}
                </button>

                {open && v.status === "done" && (
                  <div className="mt-2 border-t border-brand-light pt-2">
                    <p className="text-[11px] leading-relaxed text-ink/70">{v.reasoning}</p>
                    {v.sources && v.sources.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {v.sources.map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[9px] text-ink/50"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {allocation && (
        <div className="mt-3 rounded-xl border border-brand-light p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
            Strategist&apos;s proposal
          </p>
          <WeightBar allocation={allocation} />
          <p className="mt-2 text-[11px] leading-relaxed text-ink/70">{allocation.rationale}</p>
          <p className="mt-1.5 text-[10px] text-ink/45">
            Expected return {allocation.expectedReturnPct}% · volatility {allocation.volatilityPct}%
          </p>
        </div>
      )}

      {verdict && (
        <div
          className={`mt-3 rounded-xl border p-3 ${
            verdict.status === "block"
              ? "border-red-200 bg-red-50/60"
              : verdict.status === "rewrite"
                ? "border-amber-200 bg-amber-50/60"
                : "border-brand-green/30 bg-brand-green/5"
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">
              Compliance review
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                verdict.status === "block"
                  ? "bg-red-100 text-red-700"
                  : verdict.status === "rewrite"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-brand-green/10 text-brand-green"
              }`}
            >
              {verdict.status === "pass" ? "Cleared" : verdict.status === "rewrite" ? "Adjusted" : "Blocked"}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-ink/75">{verdict.explanation}</p>
          {verdict.violations.length > 0 && (
            <p className="mt-1.5 text-[10px] text-ink/45">
              {verdict.violations.length} finding{verdict.violations.length === 1 ? "" : "s"} recorded
            </p>
          )}
        </div>
      )}

      {ticket && (
        <p className="mt-2 text-[11px] text-ink/60">
          Referred to a relationship manager as{" "}
          <span className="font-mono text-ink">{ticket.id}</span>{" "}
          <a href="/rm" target="_blank" rel="noreferrer" className="font-medium text-brand-green underline underline-offset-2">
            open the queue →
          </a>
        </p>
      )}

      {answer && (
        <p className="mt-2 border-t border-brand-light pt-2 font-mono text-[10px] text-ink/40">
          Audit {answer.auditId}
        </p>
      )}
    </section>
  );
}

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
