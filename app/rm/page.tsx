"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetClass } from "@/lib/data/types";
import type { Allocation, AuditEntry, EscalationTicket, Severity } from "@/lib/contracts/types";
import { fetchAuditTrail, fetchRmQueue, postRmDecision } from "@/lib/client/api";
import { ASSET_LABELS } from "@/lib/format";

/**
 * The relationship manager's console.
 *
 * Deliberately outside the phone frame: this is the bank's screen, not the
 * customer's. It closes the loop the Trust tab opens — a customer watches a
 * recommendation get blocked and escalated, and this is where that escalation
 * lands, gets a human decision, and is recorded against the audit trail.
 */

const DECISIONS = [
  { id: "approved", label: "Approve", tone: "bg-brand-green text-white" },
  { id: "modified", label: "Approve with changes", tone: "bg-amber-500 text-white" },
  { id: "rejected", label: "Reject", tone: "bg-red-600 text-white" },
] as const;

const REASON_LABEL: Record<EscalationTicket["reason"], string> = {
  high_value: "High value",
  borderline: "Corrected by compliance",
  low_confidence: "Low committee confidence",
};

const STATUS_STYLE: Record<EscalationTicket["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-brand-green/10 text-brand-green",
  modified: "bg-sky-100 text-sky-700",
  rejected: "bg-red-100 text-red-700",
};

export default function RmConsole() {
  const [tickets, setTickets] = useState<EscalationTicket[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [q, a] = await Promise.all([fetchRmQueue(), fetchAuditTrail(25)]);
      setTickets(q);
      setAudit(a.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id: string, decision: (typeof DECISIONS)[number]["id"]) => {
    setBusy(id);
    try {
      await postRmDecision(id, decision);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const pending = tickets.filter((t) => t.status === "pending");
  const decided = tickets.filter((t) => t.status !== "pending");

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6 lg:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-brand-light pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-green">
            Dhan Sarthi · Bank console
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand-deep">Relationship manager queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Recommendations the automated suitability checks would not release on their own.
            A human decision is recorded against each one.
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-xl border border-brand-light bg-white px-3 py-2 text-xs font-medium text-ink/70"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-ink/50">Loading the queue…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-brand-deep">
              Awaiting decision{pending.length > 0 && ` · ${pending.length}`}
            </h2>
            {pending.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-3">
                {pending.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    busy={busy === t.id}
                    onDecide={(d) => decide(t.id, d)}
                  />
                ))}
              </div>
            )}
          </section>

          {decided.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-brand-deep">Decided</h2>
              <div className="space-y-3">
                {decided.map((t) => (
                  <TicketCard key={t.id} ticket={t} busy={false} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-1 text-sm font-semibold text-brand-deep">Audit trail</h2>
            <p className="mb-3 text-xs text-ink/55">
              Every recommendation the system produced, whether or not it needed a human.
            </p>
            {audit.length === 0 ? (
              <p className="rounded-xl border border-dashed border-brand-light py-8 text-center text-sm text-ink/45">
                Nothing recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-brand-light bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-brand-light bg-surface text-ink/55">
                    <tr>
                      <th className="px-3 py-2 font-medium">Audit ID</th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Verdict</th>
                      <th className="px-3 py-2 font-medium">Findings</th>
                      <th className="px-3 py-2 font-medium">Escalation</th>
                      <th className="px-3 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.auditId} className="border-b border-brand-light/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-[11px] text-ink/70">{e.auditId}</td>
                        <td className="px-3 py-2">{e.customerId}</td>
                        <td className="px-3 py-2">
                          <VerdictChip status={e.verdict.status} />
                        </td>
                        <td className="px-3 py-2 text-ink/60">
                          {summarise(e.verdict.violations.map((v) => v.severity))}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-ink/60">
                          {e.hitl ? e.hitl.id : "—"}
                        </td>
                        <td className="px-3 py-2 text-ink/50">
                          {new Date(e.timestamp).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-brand-light py-10 text-center">
      <p className="text-sm text-ink/55">Nothing waiting on a human right now.</p>
      <p className="mt-1 text-xs text-ink/40">
        Run a compliance check in the app&apos;s Trust tab to raise one.
      </p>
    </div>
  );
}

function TicketCard({
  ticket,
  busy,
  onDecide,
}: {
  ticket: EscalationTicket;
  busy: boolean;
  onDecide?: (d: (typeof DECISIONS)[number]["id"]) => void;
}) {
  return (
    <article className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink/70">{ticket.id}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[ticket.status]}`}>
            {ticket.status}
          </span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/60">
            {REASON_LABEL[ticket.reason]}
          </span>
        </div>
        <span className="text-[11px] text-ink/45">
          {ticket.customerId} · {new Date(ticket.createdAt).toLocaleString("en-IN")}
        </span>
      </div>

      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
        Proposal as submitted
      </p>
      <WeightBar allocation={ticket.proposed} />
      <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[11px] italic leading-relaxed text-ink/70">
        “{ticket.proposed.rationale}”
      </p>
      <p className="mt-1.5 text-[10px] text-ink/45">
        Claimed return {ticket.proposed.expectedReturnPct}% · volatility {ticket.proposed.volatilityPct}%
      </p>

      {onDecide && (
        <div className="mt-3 flex flex-wrap gap-2">
          {DECISIONS.map((d) => (
            <button
              key={d.id}
              disabled={busy}
              onClick={() => onDecide(d.id)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 ${d.tone}`}
            >
              {busy ? "Saving…" : d.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function VerdictChip({ status }: { status: AuditEntry["verdict"]["status"] }) {
  const style =
    status === "block"
      ? "bg-red-100 text-red-700"
      : status === "rewrite"
        ? "bg-amber-100 text-amber-700"
        : "bg-brand-green/10 text-brand-green";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style}`}>{status}</span>;
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

/** "2 high, 1 med" — enough to triage from, without opening the record. */
function summarise(severities: Severity[]): string {
  if (!severities.length) return "none";
  const counts = severities.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }),
    {},
  );
  return (["high", "med", "low"] as Severity[])
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(", ");
}
