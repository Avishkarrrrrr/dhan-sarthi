"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchProfile, postSimulateGoal, type GoalSimResult } from "@/lib/client/api";
import type { ProfileResponse } from "@/lib/finance/profile";
import { ProjectionChart } from "./charts/ProjectionChart";
import { inr, inrCompact } from "@/lib/format";

export function GoalPlanner({
  customerId,
  onAskAdvisor,
}: {
  customerId: string;
  onAskAdvisor: (prompt: string) => void;
}) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [goalId, setGoalId] = useState("");
  const [monthly, setMonthly] = useState(20000);
  const [ret, setRet] = useState(10);
  const [sim, setSim] = useState<GoalSimResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setProfile(null);
    setSim(null);
    setError(false);
    fetchProfile(customerId)
      .then((p) => {
        if (!live) return;
        setProfile(p);
        const g = p.customer.goals[0];
        if (g) setGoalId(g.id);
        setMonthly(Math.max(5000, Math.round((p.monthlySurplus || 20000) / 1000) * 1000));
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [customerId]);

  const goal = useMemo(() => profile?.customer.goals.find((g) => g.id === goalId), [profile, goalId]);

  useEffect(() => {
    if (!goalId) return;
    let live = true;
    postSimulateGoal(customerId, goalId, monthly, ret)
      .then((r) => live && setSim(r))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [customerId, goalId, monthly, ret]);

  if (error) return <Msg>Couldn&apos;t run the projection. Please retry.</Msg>;
  if (!profile || !goal) return <Msg>Loading your goals…</Msg>;

  const v = sim?.verdict;

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-lg font-bold text-brand-deep">Goal Planner</h2>
        <p className="text-xs text-ink/55">See if you&apos;re on track — adjust and watch it update.</p>
      </div>

      <select
        value={goalId}
        onChange={(e) => setGoalId(e.target.value)}
        className="w-full rounded-xl border border-brand-light bg-white px-3 py-2.5 text-sm font-medium text-ink"
      >
        {profile.customer.goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label} — {inrCompact(g.targetAmount)} by {g.targetYear}
          </option>
        ))}
      </select>

      {sim && (
        <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-ink/55">Projected by {goal.targetYear}</span>
            <span className="text-lg font-bold text-brand-deep">{inrCompact(sim.verdict.projected)}</span>
          </div>
          <ProjectionChart rows={sim.rows} target={goal.targetAmount} />
          {v && (
            <div
              className={`mt-2 rounded-xl px-3 py-2 text-sm font-medium ${
                v.onTrack ? "bg-brand-green/10 text-brand-green" : "bg-amber-100 text-amber-700"
              }`}
            >
              {v.onTrack
                ? `On track! You're projected to exceed your ${inrCompact(goal.targetAmount)} target. 🎯`
                : `Shortfall of ${inrCompact(v.shortfall)}. Raise your SIP or returns to close the gap.`}
            </div>
          )}
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
        <Slider
          label="Monthly investment (SIP)"
          value={monthly}
          min={2000}
          max={200000}
          step={1000}
          onChange={setMonthly}
          display={inr(monthly)}
        />
        <Slider
          label="Expected annual return"
          value={ret}
          min={4}
          max={15}
          step={0.5}
          onChange={setRet}
          display={`${ret}%`}
        />
        <p className="text-[11px] text-ink/45">
          Currently saved for this goal: {inr(goal.current)}. Returns are illustrative, not guaranteed.
        </p>
      </section>

      <button
        onClick={() =>
          onAskAdvisor(
            `I'm planning for "${goal.label}" (target ${inrCompact(goal.targetAmount)} by ${goal.targetYear}). If I invest ${inr(monthly)}/month at ${ret}% returns, am I on track and what should I change?`,
          )
        }
        className="w-full rounded-xl bg-brand-green py-3 text-sm font-semibold text-white shadow-soft"
      >
        Ask Dhan Sarthi about this →
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink/70">{label}</span>
        <span className="font-semibold text-brand-deep">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-green"
      />
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink/50">{children}</div>;
}
