"use client";

import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/client/api";
import type { ProfileResponse } from "@/lib/finance/profile";
import { AllocationChart } from "./charts/AllocationChart";
import { SpendingChart } from "./charts/SpendingChart";
import { inr, inrCompact } from "@/lib/format";
import type { Nudge } from "@/lib/finance/metrics";

export function Dashboard({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setProfile(null);
    setError(false);
    fetchProfile(customerId)
      .then((p) => live && setProfile(p))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [customerId]);

  if (error) return <ScreenMsg>Couldn't load your portfolio. Please retry.</ScreenMsg>;
  if (!profile) return <ScreenMsg>Loading your 360° view…</ScreenMsg>;

  return (
    <div className="phone-scroll flex-1 space-y-4 overflow-y-auto p-4">
      {/* Net worth header */}
      <div className="rounded-2xl bg-brand-deep p-4 text-white shadow-soft">
        <p className="text-xs text-white/70">Total net worth</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight">{inr(profile.netWorth)}</p>
        <p className="mt-1 text-xs text-white/70">
          Est. monthly surplus{" "}
          <span className="font-semibold text-brand-accent">{inrCompact(profile.monthlySurplus)}</span>
        </p>
      </div>

      <Card title="Asset allocation">
        <AllocationChart data={profile.allocation} />
      </Card>

      <Card title="Where your money goes (monthly)">
        <SpendingChart data={profile.spendingInsights} />
      </Card>

      <Card title="Dhan Sarthi noticed">
        <ul className="space-y-2">
          {profile.nudges.map((n) => (
            <NudgeRow key={n.id} n={n} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function NudgeRow({ n }: { n: Nudge }) {
  const color =
    n.severity === "warn" ? "bg-amber-100 text-amber-700" : n.severity === "good" ? "bg-brand-green/10 text-brand-green" : "bg-sky-100 text-sky-700";
  return (
    <li className="flex gap-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${color}`}>
        {n.severity === "warn" ? "!" : n.severity === "good" ? "✓" : "i"}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{n.title}</p>
        <p className="text-xs leading-relaxed text-ink/60">{n.detail}</p>
      </div>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-light bg-white p-4 shadow-soft">
      <h3 className="mb-3 text-sm font-semibold text-brand-deep">{title}</h3>
      {children}
    </section>
  );
}

function ScreenMsg({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink/50">{children}</div>;
}
