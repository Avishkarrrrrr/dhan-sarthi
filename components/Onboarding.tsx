"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { RiskProfile } from "@/lib/contracts/types";
import { postAaJourney, type AaJourneyResponse } from "@/lib/client/api";
import { AdvisorAvatar } from "./AdvisorAvatar";

/**
 * First-run onboarding.
 *
 * Deliberately the real thing at every step: the bank link runs the actual
 * Account Aggregator consent journey against IDBI's sandbox, and the risk
 * answers set the profile the committee starts from and compliance judges
 * against. Nothing here is a mock-up of a flow that exists elsewhere.
 *
 * It exists because the product is easier to understand as a journey than as a
 * finished dashboard — consent, then profile, then advice — which is also the
 * order a regulator would expect those things to happen in.
 */

type Step = "welcome" | "consent" | "profile" | "ready";

const HORIZONS: { id: string; label: string; detail: string; years: number }[] = [
  { id: "short", label: "Within 3 years", detail: "A house deposit, a wedding", years: 2 },
  { id: "medium", label: "3 to 10 years", detail: "Children's education, a bigger home", years: 6 },
  { id: "long", label: "More than 10 years", detail: "Retirement, long-term wealth", years: 15 },
];

const REACTIONS: { id: string; label: string; detail: string; score: number }[] = [
  { id: "sell", label: "I'd sell to stop the loss", detail: "Protecting capital comes first", score: 0 },
  { id: "hold", label: "I'd hold and wait", detail: "Uncomfortable, but I'd sit it out", score: 1 },
  { id: "buy", label: "I'd invest more", detail: "Lower prices are an opportunity", score: 2 },
];

/**
 * Horizon and loss-reaction together, not either alone. Someone comfortable
 * with volatility who needs the money in two years is still a conservative
 * case, because the horizon is the binding constraint — the same reason the
 * bonds desk reads the nearest goal rather than the longest.
 */
export function deriveRiskProfile(years: number, reactionScore: number): RiskProfile {
  if (years < 3) return "conservative";
  if (years < 10) return reactionScore >= 2 ? "moderate" : reactionScore === 1 ? "moderate" : "conservative";
  return reactionScore >= 2 ? "aggressive" : reactionScore === 1 ? "moderate" : "conservative";
}

export function Onboarding({
  customerId,
  onDone,
}: {
  customerId: string;
  onDone: (riskProfile: RiskProfile) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [journey, setJourney] = useState<AaJourneyResponse | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number] | null>(null);
  const [reaction, setReaction] = useState<(typeof REACTIONS)[number] | null>(null);

  const profile =
    horizon && reaction ? deriveRiskProfile(horizon.years, reaction.score) : null;

  const link = async () => {
    setLinking(true);
    setLinkError(null);
    try {
      // Deliberately does not auto-advance. The consent trace is real calls to
      // IDBI's sandbox and is the most convincing thing in the flow; skipping
      // past it in under a second wastes the one moment that proves the
      // integration is not a mock-up.
      setJourney(await postAaJourney(customerId));
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  };

  const ORDER: Step[] = ["welcome", "consent", "profile", "ready"];

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-abyss via-brand-deep to-brand-abyss">
      {/* Progress */}
      <div className="flex gap-1.5 px-5 pt-5">
        {ORDER.map((s) => (
          <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/12">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: ORDER.indexOf(step) >= ORDER.indexOf(s) ? "100%" : "0%" }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="h-full bg-brand-glow"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-5 pt-4">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <Pane key="welcome">
              <div className="flex justify-center">
                <AdvisorAvatar speaking={false} amplitude={0} mood="idle" size={150} />
              </div>
              <h2 className="mt-3 text-center text-xl font-semibold text-white">
                Namaste. I&apos;m Dhan Sarthi.
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-white/70">
                I give the kind of advice a relationship manager gives — grounded in your real
                accounts, checked against the bank&apos;s suitability rules, and explained in your
                language.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  ["🔗", "You stay in control", "I only see what you consent to share, and you can withdraw it."],
                  ["⚖️", "Every suggestion is checked", "Unsuitable advice is blocked before it reaches you."],
                  ["🗣", "Ask in eight languages", "By voice or text, whenever you want."],
                ].map(([icon, title, detail]) => (
                  <li key={title} className="flex gap-2.5 rounded-xl bg-white/[0.06] p-3">
                    <span className="text-base leading-5">{icon}</span>
                    <span>
                      <span className="block text-xs font-semibold text-white">{title}</span>
                      <span className="block text-[11px] leading-snug text-white/60">{detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Primary onClick={() => setStep("consent")}>Get started</Primary>
            </Pane>
          )}

          {step === "consent" && (
            <Pane key="consent">
              <h2 className="text-lg font-semibold text-white">Connect your bank</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                I&apos;ll ask IDBI Bank for permission to read your balances and transactions
                through the Account Aggregator network. Your banking credentials are never shared
                with me.
              </p>

              {!journey && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-glow/70">
                    What I&apos;ll be able to see
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] text-white/65">
                    <li>· Account balances and deposits</li>
                    <li>· Transaction history for the consented period</li>
                    <li>· Your KYC details as the bank holds them</li>
                  </ul>
                </div>
              )}

              {journey && <ConsentSteps journey={journey} />}

              {linkError && (
                <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-[11px] text-red-200">
                  {linkError}
                </p>
              )}

              {!journey && (
                <Primary onClick={link} disabled={linking}>
                  {linking ? "Requesting consent…" : "Give consent"}
                </Primary>
              )}
              {journey?.status === "active" && (
                <Primary onClick={() => setStep("profile")}>Continue</Primary>
              )}
              <Secondary onClick={() => setStep("profile")}>Skip for now</Secondary>
            </Pane>
          )}

          {step === "profile" && (
            <Pane key="profile">
              <h2 className="text-lg font-semibold text-white">Two questions</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                These set the limits every recommendation is checked against.
              </p>

              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-brand-glow/70">
                When will you need this money?
              </p>
              <div className="mt-2 space-y-1.5">
                {HORIZONS.map((h) => (
                  <Choice key={h.id} active={horizon?.id === h.id} onClick={() => setHorizon(h)} label={h.label} detail={h.detail} />
                ))}
              </div>

              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-brand-glow/70">
                Your investments fall 20% in a month. You…
              </p>
              <div className="mt-2 space-y-1.5">
                {REACTIONS.map((r) => (
                  <Choice key={r.id} active={reaction?.id === r.id} onClick={() => setReaction(r)} label={r.label} detail={r.detail} />
                ))}
              </div>

              {profile && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-xl border border-brand-accent/30 bg-brand-accent/10 px-3 py-2.5 text-[11px] leading-relaxed text-white/85"
                >
                  That makes you a <strong className="text-brand-glow">{profile}</strong> investor.
                  {horizon && horizon.years < 3 && reaction && reaction.score > 0 && (
                    <> Even though you&apos;re comfortable with risk, needing the money within three
                    years is the binding constraint.</>
                  )}
                </motion.p>
              )}

              <Primary onClick={() => setStep("ready")} disabled={!profile}>
                {profile ? "See my recommendation" : "Answer both to continue"}
              </Primary>
            </Pane>
          )}

          {step === "ready" && (
            <Pane key="ready">
              <div className="flex justify-center">
                <AdvisorAvatar speaking={false} amplitude={0} mood="happy" size={130} />
              </div>
              <h2 className="mt-3 text-center text-lg font-semibold text-white">You&apos;re set up</h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-white/70">
                {journey?.status === "active"
                  ? "Your IDBI accounts are linked and your profile is recorded."
                  : "Your profile is recorded. You can link your accounts any time from Portfolio."}
              </p>
              <div className="mt-4 space-y-1.5">
                {[
                  ["Risk profile", profile ?? "moderate"],
                  ["Accounts linked", journey?.status === "active" ? `${journey.linkRefNumbers.length}` : "none yet"],
                  ["Consent", journey?.consentId ?? "not granted"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg bg-white/[0.06] px-3 py-2">
                    <span className="text-[11px] text-white/55">{k}</span>
                    <span className="font-mono text-[11px] text-white">{v}</span>
                  </div>
                ))}
              </div>
              <Primary onClick={() => onDone(profile ?? "moderate")}>Meet your committee</Primary>
            </Pane>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-auto w-full rounded-xl bg-brand-accent py-3 text-sm font-semibold text-brand-abyss shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
    >
      {children}
    </button>
  );
}

function Secondary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 w-full py-2 text-xs font-medium text-white/50 hover:text-white/75">
      {children}
    </button>
  );
}

function Choice({
  active,
  onClick,
  label,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active ? "border-brand-glow bg-brand-accent/15" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      <span className="block text-xs font-semibold text-white">{label}</span>
      <span className="block text-[10px] leading-snug text-white/55">{detail}</span>
    </button>
  );
}

/** The consent journey as it happens, with IDBI's own API numbers. */
function ConsentSteps({ journey }: { journey: AaJourneyResponse }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3">
      <ol className="space-y-1.5">
        {journey.steps.map((s) => (
          <motion.li
            key={`${s.api}-${s.at}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-2 text-[11px]"
          >
            <span className={s.ok ? "text-brand-glow" : "text-red-300"}>{s.ok ? "✓" : "✕"}</span>
            <span className="font-mono text-[10px] text-white/35">API {s.api}</span>
            <span className="flex-1 text-white/70">{s.label}</span>
          </motion.li>
        ))}
      </ol>
      {journey.kyc && (
        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/70">
          Verified <strong className="text-white">{journey.kyc.name}</strong> ·{" "}
          {journey.kyc.maskedAccountNumber} · {journey.kyc.branch}
        </p>
      )}
    </div>
  );
}
