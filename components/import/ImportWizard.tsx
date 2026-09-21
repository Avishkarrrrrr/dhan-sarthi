"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, FileText, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import type { Holding } from "@/lib/data/types";
import type { ImportResult, ParsedHolding } from "@/lib/contracts/types";
import { findInstrument, searchInstruments } from "@/lib/import/symbols";
import { inr } from "@/lib/format";

/**
 * Import a portfolio from a consolidated account statement.
 *
 * Two screens, and the second is the important one. **The review is never
 * skipped** — not when the parse looks perfect, not when there is nothing to
 * review. It is where the customer confirms we read their file correctly, and
 * where they supply the purchase dates a statement does not carry, which is
 * the difference between a tax engine that works and one that cannot start.
 *
 * It is also what makes an imperfect parser safe to ship: nothing it guesses
 * is written until a person has looked at it.
 */
export function ImportWizard({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (holdings: Holding[]) => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);

  return (
    <div className="rounded-2xl border border-brand-light bg-white shadow-lift">
      <div className="flex items-center justify-between border-b border-brand-light px-4 py-2.5">
        <p className="text-sm font-semibold text-brand-deep">
          {result ? "Check what we found" : "Import your portfolio"}
        </p>
        <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink/70">
          <X className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ReviewHoldings result={result} onConfirm={onImport} onBack={() => setResult(null)} />
          </motion.div>
        ) : (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CasUpload onParsed={setResult} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CasUpload({ onParsed }: { onParsed: (r: ImportResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pan, setPan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("password", pan.trim().toUpperCase());
      const res = await fetch("/api/import/cas", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read that file");
      onParsed(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] leading-relaxed text-ink/60">
        One NSDL or CDSL statement carries both your shares and your funds. It arrives by email
        every month, or you can download it from <b>nsdlcas.nsdl.com</b> or <b>cdslindia.com</b>.
      </p>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-brand-green/40 bg-brand-green/5 px-3 py-3">
        <Upload className="h-4 w-4 shrink-0 text-brand-green" />
        <span className="min-w-0 flex-1 text-xs">
          {file ? (
            <span className="flex items-center gap-1.5 truncate font-medium text-brand-deep">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              {file.name}
            </span>
          ) : (
            <span className="text-brand-green">Choose your CAS PDF</span>
          )}
        </span>
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-medium text-ink/55">
          Password — for an NSDL or CDSL statement this is your PAN, in capitals
        </span>
        <input
          value={pan}
          onChange={(e) => setPan(e.target.value.toUpperCase())}
          placeholder="ABCDE1234F"
          className="mt-0.5 w-full rounded-lg border border-brand-light bg-surface px-3 py-2 font-mono text-sm tracking-wide outline-none focus:border-brand-green"
        />
      </label>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        onClick={upload}
        disabled={!file || busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Reading…" : "Read my statement"}
      </button>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink/45">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-brand-green" />
        Your statement is read in memory and thrown away immediately. It is never saved, never
        uploaded anywhere else, and your PAN is never stored.
      </p>
    </div>
  );
}

/** One row as the customer is about to accept it. */
interface Draft extends ParsedHolding {
  include: boolean;
  avgPrice: number;
  boughtOn: string;
}

function ReviewHoldings({
  result,
  onConfirm,
  onBack,
}: {
  result: ImportResult;
  onConfirm: (h: Holding[]) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>(
    result.holdings.map((h) => ({ ...h, include: true, avgPrice: 0, boughtOn: "" })),
  );
  const [adding, setAdding] = useState("");

  const update = (i: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /** Anything the file could not give us, typed in by hand. */
  const addManual = (name: string) => {
    const inst = searchInstruments(name, 1)[0];
    if (!inst) return;
    setRows((rs) => [
      ...rs,
      {
        kind: inst.assetClass === "mutual_fund" ? "mf" : "equity",
        name: inst.name,
        symbol: inst.symbol,
        quantity: 0,
        lots: [],
        needsCostBasis: true,
        include: true,
        avgPrice: 0,
        boughtOn: "",
      },
    ]);
    setAdding("");
  };

  const confirm = () => {
    const holdings: Holding[] = rows
      .filter((r) => r.include && r.quantity > 0)
      .map((r) => {
        const inst = r.symbol ? findInstrument(r.symbol) : searchInstruments(r.name, 1)[0];
        const hasLot = r.avgPrice > 0 && !!r.boughtOn;
        return {
          assetClass: r.kind === "mf" ? ("mutual_fund" as const) : ("equity" as const),
          name: inst?.name ?? r.name,
          value: r.value ?? r.quantity * (r.avgPrice || 0),
          quantity: r.quantity,
          ...(inst?.kind === "equity" ? { symbol: inst.symbol } : {}),
          // A lot is only recorded when both halves are present. Half a cost
          // basis produces a confident capital-gains number out of a guess.
          ...(hasLot
            ? { lots: [{ acquiredOn: r.boughtOn, quantity: r.quantity, costPerUnit: r.avgPrice }] }
            : {}),
        };
      });
    onConfirm(holdings);
  };

  const missing = rows.filter((r) => r.include && (!r.avgPrice || !r.boughtOn)).length;

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] leading-relaxed text-ink/60">
        {result.holdings.length > 0
          ? `Read ${result.holdings.length} holding${result.holdings.length === 1 ? "" : "s"} from your ${label(result.method)}${result.panMasked ? ` (PAN ${result.panMasked})` : ""}. Correct anything that looks wrong — nothing is saved until you confirm.`
          : "Nothing could be read from that file. Add your holdings here instead — it takes a minute and the result is the same."}
      </p>

      {result.warnings.map((w, i) => (
        <p key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          {w}
        </p>
      ))}

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={`${r.isin ?? r.name}-${i}`} className="rounded-xl border border-brand-light p-2.5">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => update(i, { include: e.target.checked })}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-[#0B7A4B]"
                aria-label={`Include ${r.name}`}
              />
              <div className="min-w-0 flex-1">
                <input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="w-full truncate bg-transparent text-xs font-medium text-ink outline-none"
                />
                <p className="text-[10px] text-ink/40">
                  {r.kind === "mf" ? "Mutual fund" : r.kind === "bond" ? "Bond" : "Share"}
                  {r.isin && ` · ${r.isin}`}
                  {r.value ? ` · ${inr(r.value)}` : ""}
                </p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <Field
                    label={r.kind === "mf" ? "Units" : "Shares"}
                    value={r.quantity}
                    onChange={(v) => update(i, { quantity: v })}
                  />
                  <Field label="Avg price" value={r.avgPrice} onChange={(v) => update(i, { avgPrice: v })} />
                  <label className="block">
                    <span className="text-[9px] font-medium text-ink/50">Bought on</span>
                    <input
                      type="date"
                      value={r.boughtOn}
                      onChange={(e) => update(i, { boughtOn: e.target.value })}
                      className="w-full rounded border border-brand-light bg-white px-1.5 py-1 text-[11px]"
                    />
                  </label>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Tier 1 inside tier 2: whatever the file missed, type it. */}
      <div className="relative">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Missing something? Search and add it"
          className="w-full rounded-lg border border-dashed border-brand-light bg-surface px-3 py-2 text-xs outline-none focus:border-brand-green"
        />
        {adding.trim() && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-brand-light bg-white shadow-lift">
            {searchInstruments(adding, 5).map((m) => (
              <li key={m.symbol}>
                <button
                  onClick={() => addManual(m.name)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface"
                >
                  <span className="truncate text-xs text-ink">{m.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink/45">{m.symbol}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {missing > 0 && (
        <p className="text-[10px] leading-relaxed text-ink/50">
          {missing} row{missing === 1 ? " has" : "s have"} no purchase price or date. They will still
          be counted — but the tax desk cannot work out a holding period without them.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="rounded-xl border border-brand-light px-4 py-2.5 text-sm font-medium text-ink/70"
        >
          Back
        </button>
        <button
          onClick={confirm}
          className="flex-1 rounded-xl bg-brand-green py-2.5 text-sm font-semibold text-white"
        >
          Add {rows.filter((r) => r.include && r.quantity > 0).length} to my portfolio
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-medium text-ink/50">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded border border-brand-light bg-white px-1.5 py-1 text-[11px]"
      />
    </label>
  );
}

function label(method: ImportResult["method"]): string {
  return method === "cas_cams" ? "CAMS statement" : method === "cas_cdsl" ? "CDSL statement" : "NSDL statement";
}
