"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileClock,
  PenLine,
  Radar,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  XCircle,
} from "lucide-react";
import type { AssetClass } from "@/lib/data/types";
import type {
  Allocation,
  AuditEntry,
  EscalationTicket,
  ProposedAction,
  Severity,
  TicketKind,
} from "@/lib/contracts/types";
import { fetchAuditTrail, fetchRmQueue, postRmDecision } from "@/lib/client/api";
import { ACTION_VERB, ASSET_LABELS, inr } from "@/lib/format";

/**
 * The relationship manager's console.
 *
 * Deliberately outside the phone frame: this is the bank's screen, not the
 * customer's. It closes the loop the Trust tab opens — a customer watches a
 * recommendation get blocked and escalated, and this is where that escalation
 * lands, gets a *named* human decision, and is recorded against the audit
 * trail.
 *
 * The RM is not blocking the customer's right to buy. They are approving the
 * bank's advice. The customer can do what they like with their own money; what
 * needs a signature is the bank recommending it.
 */

const DECISIONS = [
  { id: "approved", label: "Approve", tone: "bg-brand-green text-white", Icon: CheckCircle2 },
  { id: "modified", label: "Approve with changes", tone: "bg-amber-500 text-white", Icon: PenLine },
  { id: "rejected", label: "Reject", tone: "bg-red-600 text-white", Icon: XCircle },
] as const;

const REASON_LABEL: Record<EscalationTicket["reason"], string> = {
  high_value: "High value",
  borderline: "Corrected by compliance",
  low_confidence: "Committee disagreed",
  deposit_flight: "Money leaving the bank",
};

const STATUS_STYLE: Record<EscalationTicket["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-brand-green/10 text-brand-green",
  modified: "bg-sky-100 text-sky-700",
  rejected: "bg-red-100 text-red-700",
};

const TABS: { id: TicketKind; label: string; Icon: typeof ShieldAlert }[] = [
  { id: "advice_approval", label: "Advice approvals", Icon: ShieldAlert },
  { id: "retention_alert", label: "Retention alerts", Icon: TrendingDown },
];

export default function RmConsole() {
  const [tickets, setTickets] = useState<EscalationTicket[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TicketKind>("advice_approval");

  /*
   * Who is signing. Remembered per browser so the RM types it once, but never
   * defaulted to a placeholder — an approval recorded against "RM" or "admin"
   * is exactly the anonymous signature this gate exists to prevent.
   */
  const [rm, setRm] = useState("");
  useEffect(() => {
    try {
      setRm(localStorage.getItem("dhan-sarthi.rm") ?? "");
    } catch {
      /* private browsing: they can still type it each time */
    }
  }, []);
  const setRmName = (v: string) => {
    setRm(v);
    try {
      localStorage.setItem("dhan-sarthi.rm", v);
    } catch {
      /* nothing to remember it with */
    }
  };

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

  /*
   * Sweep the roster for money leaving the bank. An RM does not ask "how is
   * this customer doing" — they ask "who is leaving", so the scan runs across
   * everyone rather than one at a time.
   */
  const [scanning, setScanning] = useState(false);
  const scan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/rm/scan", { method: "POST" });
      if (!res.ok) throw new Error(`scan ${res.status}`);
      await refresh();
      setTab("retention_alert");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const decide = async (id: string, decision: (typeof DECISIONS)[number]["id"]) => {
    if (!rm.trim()) {
      setError("Enter your name before deciding — the record has to say who signed.");
      return;
    }
    setBusy(id);
    try {
      await postRmDecision(id, decision, rm.trim());
      await refresh();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Tickets raised before `kind` existed are advice approvals; treating them as
  // neither would silently empty the queue after a deploy.
  const ofKind = useMemo(
    () => tickets.filter((t) => (t.kind ?? "advice_approval") === tab),
    [tickets, tab],
  );
  const pending = ofKind.filter((t) => t.status === "pending");
  const decided = ofKind.filter((t) => t.status !== "pending");
  const countFor = (k: TicketKind) =>
    tickets.filter((t) => (t.kind ?? "advice_approval") === k && t.status === "pending").length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6 lg:p-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-brand-light pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-green">
            Dhan Sarthi · Bank console
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand-deep">Relationship manager queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Recommendations the automated suitability checks would not release on their own. The
            customer consents to their money; this is where the bank signs for its advice.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-xl border border-brand-light bg-white px-3 py-2 text-xs font-medium text-ink/70 hover:bg-surface disabled:opacity-50"
          >
            <Radar className="h-3.5 w-3.5" />
            {scanning ? "Scanning…" : "Scan for deposit flight"}
          </button>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-xl border border-brand-light bg-white px-3 py-2 text-xs font-medium text-ink/70 hover:bg-surface"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {/* Who is signing. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-light bg-white px-4 py-3">
        <BadgeCheck className="h-5 w-5 shrink-0 text-brand-green" />
        <label className="text-xs font-medium text-ink/70" htmlFor="rm-name">
          Signing as
        </label>
        <input
          id="rm-name"
          value={rm}
          onChange={(e) => setRmName(e.target.value)}
          placeholder="Your name and employee ID"
          className="min-w-[14rem] flex-1 rounded-lg border border-brand-light bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand-green"
        />
        <p className="text-[11px] text-ink/45">
          Recorded against every decision. An unsigned approval is not an approval.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Two queues, one per kind. */}
      <div className="mb-5 flex gap-2 border-b border-brand-light">
        {TABS.map((t) => {
          const on = tab === t.id;
          const n = countFor(t.id);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-brand-green text-brand-deep"
                  : "border-transparent text-ink/50 hover:text-ink/75"
              }`}
            >
              <t.Icon className="h-4 w-4" />
              {t.label}
              {n > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink/50">Loading the queue…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-brand-deep">
              Awaiting decision{pending.length > 0 && ` · ${pending.length}`}
            </h2>
            {pending.length === 0 ? (
              <EmptyState kind={tab} />
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
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-deep">
              <FileClock className="h-4 w-4" />
              Audit trail
            </h2>
            <p className="mb-3 text-xs text-ink/55">
              Every recommendation the system produced, whether or not it needed a human — with both
              signatures where they exist.
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
                      <th className="px-3 py-2 font-medium">Customer said</th>
                      <th className="px-3 py-2 font-medium">Bank signed</th>
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
                        <td className="px-3 py-2 text-ink/60">{e.customerDecision ?? "—"}</td>
                        <td className="px-3 py-2 text-ink/60">{e.hitl?.decidedBy ?? "—"}</td>
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

function EmptyState({ kind }: { kind: TicketKind }) {
  return (
    <div className="rounded-xl border border-dashed border-brand-light py-10 text-center">
      <p className="text-sm text-ink/55">Nothing waiting on a human right now.</p>
      <p className="mt-1 text-xs text-ink/40">
        {kind === "advice_approval"
          ? "Run a compliance check in the app's Trust tab to raise one."
          : "Raised automatically when a customer's money starts leaving the bank."}
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink/70">{ticket.id}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[ticket.status]}`}>
            {ticket.status}
          </span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink/60">
            {REASON_LABEL[ticket.reason] ?? ticket.reason}
          </span>
        </div>
        <span className="text-[11px] text-ink/45">
          {ticket.customerId} · {new Date(ticket.createdAt).toLocaleString("en-IN")}
        </span>
      </div>

      {ticket.retention && <RetentionBody insight={ticket.retention} />}

      {ticket.proposed && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
            Proposal as submitted
          </p>
          <WeightBar allocation={ticket.proposed} />
          <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-[11px] italic leading-relaxed text-ink/70">
            “{ticket.proposed.rationale}”
          </p>
          <p className="mt-1.5 text-[10px] text-ink/45">
            Claimed return {ticket.proposed.expectedReturnPct}% · volatility{" "}
            {ticket.proposed.volatilityPct}%
          </p>
        </>
      )}

      {ticket.actions?.length > 0 && <ActionList actions={ticket.actions} />}

      {/* The record this whole gate exists to produce. */}
      {ticket.decidedBy && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-light/50 px-3 py-2 text-[11px] text-brand-deep">
          <BadgeCheck className="h-3.5 w-3.5" />
          {ticket.status === "rejected" ? "Rejected" : "Signed"} by{" "}
          <b>{ticket.decidedBy}</b>
          {ticket.decidedAt && ` · ${new Date(ticket.decidedAt).toLocaleString("en-IN")}`}
        </p>
      )}

      {onDecide && (
        <div className="mt-3 flex flex-wrap gap-2">
          {DECISIONS.map((d) => (
            <button
              key={d.id}
              disabled={busy}
              onClick={() => onDecide(d.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 ${d.tone}`}
            >
              <d.Icon className="h-3.5 w-3.5" />
              {busy ? "Saving…" : d.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function ActionList({ actions }: { actions: ProposedAction[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/45">
        What this would actually do
      </p>
      <ul className="space-y-1.5">
        {actions.map((a, i) => (
          <li key={i} className="rounded-lg border border-brand-light px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-brand-deep">
                {ACTION_VERB[a.kind]} {a.instrument}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                {inr(a.amount)}
                {(a.kind === "start_sip" || a.kind === "step_up_sip") && (
                  <span className="text-[10px] font-normal text-ink/50">/mo</span>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink/60">{a.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RetentionBody({ insight }: { insight: NonNullable<EscalationTicket["retention"]> }) {
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-red-600" />
        <span className="text-xs font-semibold text-brand-deep">
          Attrition risk {Math.round(insight.attritionRisk * 100)}%
        </span>
      </div>
      <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-900">
        {insight.narrative}
      </p>
      {insight.signals.length > 0 && (
        <ul className="mt-2 space-y-1">
          {insight.signals.slice(0, 4).map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-ink/70">
                {s.counterpartyHint || s.destination.replace(/_/g, " ")}
                {s.recurring && <span className="ml-1 text-ink/45">· recurring</span>}
              </span>
              <span className="shrink-0 tabular-nums text-ink">{inr(s.trailing3mTotal)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
