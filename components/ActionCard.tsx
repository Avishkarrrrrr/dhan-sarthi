"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, X } from "lucide-react";
import type { ProposedAction } from "@/lib/contracts/types";
import { postActionDecision } from "@/lib/client/api";
import { ACTION_VERB, inr } from "@/lib/format";

/**
 * The customer's own decision on their own money.
 *
 * This is a different gate from the RM console, and conflating them is the
 * mistake worth avoiding: the customer approving a trade is *consent*, not a
 * suitability sign-off by the bank. A customer can buy whatever they like with
 * their money; what needs a licensed human's signature is the bank having
 * recommended it. Both decisions land on the same audit entry, and only
 * together do they describe what actually happened.
 */
export function ActionCard({
  actions,
  auditId,
  escalated,
}: {
  actions: ProposedAction[];
  auditId: string;
  /** True when this also went to an RM — the customer should know that. */
  escalated?: boolean;
}) {
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!actions.length) return null;

  const decide = async (d: "approved" | "declined") => {
    setBusy(true);
    setError(null);
    try {
      await postActionDecision(auditId, d);
      setDecision(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-brand-green/30 bg-white p-4 shadow-lift"
    >
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-green" />
        <h3 className="text-sm font-semibold text-brand-deep">Your call</h3>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-ink/55">
        It is your money — nothing happens until you say so.
      </p>

      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="rounded-xl border border-brand-light bg-surface/60 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-brand-deep">
                {ACTION_VERB[a.kind]} {a.instrument}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-brand-deep">
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

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>
      )}

      <AnimatePresence mode="wait">
        {decision ? (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 rounded-xl bg-brand-light/70 px-3 py-2.5"
          >
            <p className="text-xs font-semibold text-brand-deep">
              {decision === "approved" ? "Approved by you" : "Declined by you"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink/60">
              {escalated
                ? "Recorded against your file. Because of the size, a relationship manager also signs for the bank's side of this before anything is placed."
                : "Recorded against your file."}
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink/40">Audit {auditId}</p>
          </motion.div>
        ) : (
          <motion.div key="ask" exit={{ opacity: 0 }} className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={() => decide("approved")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {busy ? "Saving…" : "Approve"}
            </button>
            <button
              disabled={busy}
              onClick={() => decide("declined")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-light px-4 py-2.5 text-sm font-semibold text-ink/70 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Not now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {escalated && !decision && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink/45">
          This one also goes to a relationship manager. You are approving what happens to your
          money; they sign for the bank having recommended it.
        </p>
      )}
    </motion.section>
  );
}
