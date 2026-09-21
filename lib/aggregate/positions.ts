import type {
  BondHolding,
  Customer,
  DepositAccount,
  EquityPosition,
  GoldHolding,
  Holding,
  MfHolding,
  TypedPositions,
} from "@/lib/contracts/types";
import { classify } from "@/lib/finance/xray";
import { findInstrument } from "@/lib/import/symbols";

/**
 * The flat holdings list, projected into the six asset kinds.
 *
 * Derived rather than stored. One source of truth for what a customer owns,
 * and this is a view over it — so there is no way for the typed shape and the
 * holdings to disagree, which is the failure mode of keeping both.
 */

/** Weighted average cost from the lots, or the current value if we have none. */
function avgPrice(h: Holding): number {
  const lots = h.lots ?? [];
  const units = lots.reduce((s, l) => s + l.quantity, 0);
  if (units > 0) return lots.reduce((s, l) => s + l.quantity * l.costPerUnit, 0) / units;
  return h.quantity ? h.value / h.quantity : 0;
}

/** Last four digits only. A full account number has no business leaving here. */
function maskAccount(name: string): string {
  const digits = name.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : name;
}

function goldForm(name: string): GoldHolding["form"] {
  const n = name.toLowerCase();
  if (n.includes("sovereign") || n.includes("sgb")) return "sgb";
  if (n.includes("etf")) return "etf";
  if (n.includes("digital")) return "digital";
  return "physical";
}

export function toPositions(
  customer: Customer,
  quotes: Record<string, { ltp: number; dayChangePct?: number }> = {},
): TypedPositions {
  const holdings = customer.holdings ?? [];

  const equity: EquityPosition[] = holdings
    .filter((h) => h.assetClass === "equity")
    .map((h) => {
      const symbol = h.symbol ?? findInstrument(h.name)?.symbol ?? "";
      const quantity = h.quantity ?? 0;
      const avg = avgPrice(h);
      const quote = symbol ? quotes[symbol.toUpperCase()] : undefined;
      // No live price means the position is worth what the source said, not
      // zero and not a guess.
      const lastPrice = quote?.ltp ?? (quantity > 0 ? h.value / quantity : avg);
      const invested = quantity * avg;
      const currentValue = quantity > 0 ? quantity * lastPrice : h.value;
      const pnl = currentValue - invested;
      return {
        symbol,
        name: h.name,
        quantity,
        avgPrice: avg,
        lastPrice,
        invested,
        currentValue,
        pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
        ...(quote?.dayChangePct !== undefined ? { dayChangePct: quote.dayChangePct } : {}),
        ...(h.lots?.length ? { lots: h.lots } : {}),
      };
    });

  const mutualFunds: MfHolding[] = holdings
    .filter((h) => h.assetClass === "mutual_fund")
    .map((h) => ({
      schemeName: h.name,
      // The category the look-through modelled it as, so the typed view and
      // the concentration rules describe the same fund the same way.
      category: classify(h)?.model.label ?? "Not classified",
      ...(h.quantity ? { units: h.quantity } : {}),
      currentValue: h.value,
      ...(h.lots?.length ? { lots: h.lots } : {}),
    }));

  const deposits: DepositAccount[] = holdings
    .filter((h) => h.assetClass === "fd" || h.assetClass === "cash")
    .map((h) => {
      const lien = h.lienAmount ?? 0;
      return {
        kind: h.assetClass === "cash" ? ("SAVINGS" as const) : ("FD" as const),
        accountNo: maskAccount(h.name),
        currentValue: h.value,
        lienMarked: lien,
        investible: Math.max(0, h.value - lien),
      };
    });

  const bonds: BondHolding[] = holdings
    .filter((h) => h.assetClass === "bonds")
    .map((h) => ({ name: h.name, currentValue: h.value }));

  const gold: GoldHolding[] = holdings
    .filter((h) => h.assetClass === "gold")
    .map((h) => ({ form: goldForm(h.name), name: h.name, currentValue: h.value }));

  return { deposits, equity, mutualFunds, bonds, gold };
}
