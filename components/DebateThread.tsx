"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { Exchange } from "@/lib/agents/debate";
import type { AgentId, AssetClass } from "@/lib/contracts/types";

/**
 * The committee arguing, as a conversation.
 *
 * The first attempt at this drew a line between two tiles on a grid. It was
 * accurate and it communicated nothing: a customer saw arrows on boxes. People
 * do not read graphs of who-spoke-to-whom, they read conversations — and they
 * read one every day, so the grammar is already in their head. Speaker on the
 * left, reply indented under it, someone typing before they answer.
 *
 * Every line is the committee's own output. The first bubble is the opposing
 * desk's headline verbatim — the argument that won — and the second is the
 * conceding desk's answer. The chip is the tilt that actually moved, which is
 * what makes this a deliberation rather than a dramatisation: if the numbers
 * did not change, the strategist would fuse the same inputs and nothing here
 * would matter.
 */

const TYPING_MS = 850;

export function DebateThread({
  exchanges,
  deskLabel,
  deskRole,
  deskIcon,
  assetLabel,
  /** True while more exchanges are still arriving. */
  live,
}: {
  exchanges: Exchange[];
  deskLabel: Record<AgentId, string>;
  deskRole: Record<AgentId, string>;
  deskIcon: Record<AgentId, LucideIcon>;
  assetLabel: Record<AssetClass, string>;
  live: boolean;
}) {
  if (exchanges.length === 0 && !live) return null;

  return (
    <div className="space-y-3 px-3 pb-1">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold text-white/70">The desks talk it through</h4>
        {live && (
          <span className="flex items-center gap-1 text-[10px] text-brand-glow/80">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-glow opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-glow" />
            </span>
            live
          </span>
        )}
      </div>

      {/*
        A desk whose argument carries twice would otherwise state it twice,
        word for word, a few lines apart — true to the data and unreadable as
        conversation. The second time, it is referred back to instead.
      */}
      {(() => {
        const heard = new Set<string>();
        return exchanges.map((x, i) => {
          const key = `${x.to}:${x.quote}`;
          const again = heard.has(key);
          heard.add(key);
          return (
            <Turn
              key={`${x.from}-${x.assetClass}-${i}`}
              x={x}
              again={again}
              deskLabel={deskLabel}
              deskRole={deskRole}
              deskIcon={deskIcon}
              assetLabel={assetLabel}
            />
          );
        });
      })()}
    </div>
  );
}

/** One round: a desk states its case, another answers it. */
function Turn({
  x,
  again,
  deskLabel,
  deskRole,
  deskIcon,
  assetLabel,
}: {
  x: Exchange;
  /** This desk's argument has already been stated in this thread. */
  again: boolean;
  deskLabel: Record<AgentId, string>;
  deskRole: Record<AgentId, string>;
  deskIcon: Record<AgentId, LucideIcon>;
  assetLabel: Record<AssetClass, string>;
}) {
  /*
   * The reply is held back briefly behind a typing indicator. It is the whole
   * reason this reads as two people rather than one block of text arriving —
   * the pause is where the sense of someone considering an answer lives.
   */
  const [answered, setAnswered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnswered(true), TYPING_MS);
    return () => clearTimeout(t);
  }, []);

  const moved = x.after !== x.before;
  const up = x.after > x.before;
  const Challenger = deskIcon[x.to];
  const Responder = deskIcon[x.from];

  return (
    <div className="space-y-1.5">
      {/* The desk whose argument carried */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex gap-2"
      >
        <span
          className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 ${
            again ? "h-5 w-5" : "h-6 w-6"
          }`}
        >
          <Challenger className={again ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={1.75} aria-hidden />
        </span>
        {again ? (
          <p className="pt-0.5 text-[10px] text-white/40">
            Still <span className="font-medium text-white/60">{deskLabel[x.to]}</span>, on the same
            point
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] text-white/45">
              <span className="font-semibold text-white/80">{deskLabel[x.to]}</span> ·{" "}
              {deskRole[x.to]}
            </p>
            <div className="rounded-2xl rounded-tl-sm bg-white/[0.07] px-3 py-2">
              <p className="text-[11px] leading-relaxed text-white/85">{x.quote}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* The desk answering, indented so the reply reads as a reply */}
      <div className="flex gap-2 pl-6">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-glow/15 text-brand-glow">
          <Responder className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[10px] text-white/45">
            <span className="font-semibold text-brand-glow">{deskLabel[x.from]}</span> ·{" "}
            {deskRole[x.from]}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            {!answered ? (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1 rounded-2xl rounded-tl-sm bg-brand-glow/10 px-3 py-2.5"
                aria-label={`${deskLabel[x.from]} is responding`}
              >
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-brand-glow/70"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="reply"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl rounded-tl-sm bg-brand-glow/10 px-3 py-2"
              >
                <p className="text-[11px] leading-relaxed text-white/85">{x.reply}</p>

                {/* What the argument actually changed */}
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-medium text-white/60">
                    {assetLabel[x.assetClass]}
                  </span>
                  {moved ? (
                    <span className="font-mono tabular-nums text-white/45">
                      {x.before > 0 ? "+" : ""}
                      {x.before.toFixed(2)}
                      <span className="mx-1 text-white/30">→</span>
                      <span className={up ? "font-semibold text-brand-glow" : "font-semibold text-signal-down"}>
                        {x.after > 0 ? "+" : ""}
                        {x.after.toFixed(2)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-white/45">unresolved — the strategist decides</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
