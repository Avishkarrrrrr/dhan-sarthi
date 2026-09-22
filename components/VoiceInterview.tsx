"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, Send, Square } from "lucide-react";
import type {
  DiscoverySlot,
  DiscoveryState,
  InvestmentPolicyStatement,
} from "@/lib/contracts/types";
import { useVoice } from "@/lib/client/useVoice";

/**
 * Stage 2: the avatar interviews the customer and builds their plan.
 *
 * The checklist on the right is the whole idea made visible — eight things to
 * find out, filling up one at a time. A progress bar would say the same thing
 * and mean nothing; watching "how much each month" tick green as you answer it
 * is what makes this read as an interview rather than a form.
 *
 * **There is always a typed fallback.** A microphone that does not work at the
 * venue must cost us a demo flourish, never the demo. Both paths hit the same
 * endpoint with the same string, so nothing about the plan depends on which
 * one was used.
 */

const SLOT_LABELS: Record<DiscoverySlot, string> = {
  shortTermGoals: "Short-term goals",
  longTermGoals: "Long-term goals",
  horizonYears: "How long",
  targetCorpus: "Target amount",
  monthlyInvestable: "Monthly amount",
  annualStepUpPct: "Annual step-up",
  riskAppetite: "Risk appetite",
  liquidityBufferMonths: "Emergency buffer",
};

const ORDER: DiscoverySlot[] = [
  "shortTermGoals",
  "longTermGoals",
  "horizonYears",
  "targetCorpus",
  "monthlyInvestable",
  "annualStepUpPct",
  "riskAppetite",
  "liquidityBufferMonths",
];

interface Line {
  who: "avatar" | "customer";
  text: string;
}

/** The languages the interview is written in, not merely spoken in. */
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "mr-IN", label: "मराठी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "bn-IN", label: "বাংলা" },
];

export function VoiceInterview({
  customerId,
  language: initialLanguage = "en-IN",
  onComplete,
}: {
  customerId: string;
  language?: string;
  onComplete?: (ips: InvestmentPolicyStatement) => void;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [state, setState] = useState<DiscoveryState | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (transcript: string) => {
      const text = transcript.trim();
      if (!text || !state || busy || done) return;
      setLines((l) => [...l, { who: "customer", text }]);
      setTyped("");
      setBusy(true);
      try {
        const res = await fetch("/api/discovery/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: state.sessionId, transcript: text }),
        });
        if (!res.ok) throw new Error(`turn ${res.status}`);
        const json = await res.json();
        setState(json.state);
        setLines((l) => [...l, { who: "avatar", text: json.spokenText }]);
        void speak(json.spokenText, language);
        if (json.complete && json.ips) {
          setDone(true);
          onComplete?.(json.ips);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    // `speak` is defined below by the hook; it is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, busy, done, language, onComplete],
  );

  const { isRecording, isSpeaking, startRecording, stopRecording, speak, stopSpeaking } =
    useVoice(send);

  // Open the conversation once.
  useEffect(() => {
    let live = true;
    fetch("/api/discovery/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, language }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!live || json.error) {
          if (json?.error) setError(json.error);
          return;
        }
        setState(json.state);
        setLines([{ who: "avatar", text: json.spokenText }]);
        void speak(json.spokenText, language);
      })
      .catch((e) => live && setError(String(e.message ?? e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, language]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const filled = new Set(Object.keys(state?.filled ?? {}));
  const current = state?.pending[0];

  return (
    <div className="flex h-full flex-col">
      {/* The checklist. The interview's shape, visible. */}
      <div className="border-b border-brand-light bg-surface/60 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-deep">Your plan</p>
          <div className="flex items-center gap-2">
            {/*
              Chosen before the first question, and locked after it. Switching
              language mid-interview would leave half the conversation in a
              language the customer cannot re-read, which is worse than either
              language alone.
            */}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={lines.length > 1}
              aria-label="Interview language"
              className="rounded-lg border border-brand-light bg-white px-2 py-1 text-[11px] text-ink/70 disabled:opacity-50"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] tabular-nums text-ink/50">
              {filled.size} of {ORDER.length}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ORDER.map((slot) => {
            const on = filled.has(slot);
            const asking = current === slot;
            return (
              <div key={slot} className="flex items-center gap-1.5">
                <motion.span
                  animate={{ scale: on ? [1, 1.3, 1] : 1 }}
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                    on
                      ? "bg-brand-green text-white"
                      : asking
                        ? "bg-brand-accent/30 ring-2 ring-brand-accent"
                        : "bg-ink/10"
                  }`}
                >
                  {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </motion.span>
                <span
                  className={`truncate text-[11px] ${
                    on ? "text-ink/70" : asking ? "font-medium text-brand-deep" : "text-ink/40"
                  }`}
                >
                  {SLOT_LABELS[slot]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The conversation. */}
      <div ref={scroller} className="phone-scroll flex-1 space-y-2.5 overflow-y-auto p-4 pb-24">
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={l.who === "avatar" ? "" : "flex justify-end"}
            >
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  l.who === "avatar"
                    ? "bg-brand-light/70 text-ink"
                    : "bg-brand-green text-white"
                }`}
              >
                {l.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && <p className="text-xs text-ink/40">…</p>}
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {state?.warnings.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Noted, and kept
            </p>
            {state.warnings.map((w, i) => (
              <p key={i} className="mt-0.5 text-[11px] leading-relaxed text-amber-900/85">
                {w}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {/* Answer by voice or by typing. Never only by voice. */}
      <div className="flex items-center gap-2 border-t border-brand-light p-3">
        <button
          onClick={() => {
            if (isRecording) return stopRecording();
            // Barge-in: a customer who starts answering should not have to
            // wait politely for the avatar to finish its sentence.
            if (isSpeaking) stopSpeaking();
            startRecording(language);
          }}
          disabled={busy || done}
          aria-label={isRecording ? "Stop recording" : "Answer by voice"}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
            isRecording ? "bg-red-500 text-white" : "bg-brand-green text-white"
          }`}
        >
          {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(typed)}
          disabled={busy || done}
          placeholder={done ? "Plan confirmed" : "…or type your answer"}
          className="flex-1 rounded-xl border border-brand-light bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-green disabled:opacity-60"
        />
        {isSpeaking && (
          <button
            onClick={stopSpeaking}
            aria-label="Stop speaking"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-brand-light px-3 text-[11px] font-medium text-ink/60"
          >
            <Square className="h-3 w-3" />
            Skip
          </button>
        )}
        <button
          onClick={() => send(typed)}
          disabled={busy || done || !typed.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-deep text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
