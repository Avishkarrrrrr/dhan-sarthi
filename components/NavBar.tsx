"use client";

export type Screen = "advisor" | "dashboard" | "planner";

const TABS: { id: Screen; label: string; icon: JSX.Element }[] = [
  {
    id: "advisor",
    label: "Advisor",
    icon: (
      <path d="M12 3a7 7 0 0 0-7 7c0 3.9 3.1 7 7 7h.5l3 2.5V17a7 7 0 0 0 3.5-6 7 7 0 0 0-7-8Z" />
    ),
  },
  {
    id: "dashboard",
    label: "Portfolio",
    icon: <path d="M4 13h4v7H4v-7Zm6-6h4v13h-4V7Zm6 3h4v10h-4V10Z" />,
  },
  {
    id: "planner",
    label: "Goals",
    icon: (
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z" />
    ),
  },
];

export function NavBar({
  active,
  onChange,
}: {
  active: Screen;
  onChange: (s: Screen) => void;
}) {
  return (
    <nav className="sticky bottom-0 z-20 mt-auto grid grid-cols-3 border-t border-brand-light bg-white/95 backdrop-blur">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
              on ? "text-brand-green" : "text-ink/45"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 0 : 1.6}>
              {t.icon}
            </svg>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
