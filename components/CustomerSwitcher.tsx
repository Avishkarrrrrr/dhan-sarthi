"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import type { CustomerSummary } from "@/lib/data/types";

/**
 * The customer picker in the app header.
 *
 * This was a native `<select>` styled as a pill, which cannot work: the
 * chevron is drawn by the operating system and the option list is OS chrome
 * that ignores every style given to it, so on a dark green header it opened as
 * a light system menu in a different typeface. A menu is one of the few
 * controls worth building by hand for exactly this reason.
 *
 * Kept deliberately small: a button, a list, outside-click and Escape to
 * close. Roving focus is not worth the code here — the list is three items
 * long and each one is reachable by Tab.
 */
export function CustomerSwitcher({
  customers,
  value,
  onChange,
}: {
  customers: CustomerSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = customers.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (customers.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-white/15 py-1.5 pl-3 pr-2 text-xs font-medium text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow"
      >
        <span className="max-w-[9rem] truncate">{current?.name ?? "Choose"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lift"
          >
            {customers.map((c) => {
              const selected = c.id === value;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-brand-light/60 ${
                      selected ? "bg-brand-light/40" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{c.name}</span>
                      {c.persona && (
                        <span className="block truncate text-[10px] text-ink/50">{c.persona}</span>
                      )}
                    </span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand-green" strokeWidth={3} aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
