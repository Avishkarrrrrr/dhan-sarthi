import { describe, it, expect } from "vitest";
import type { Customer, Holding } from "@/lib/data/types";
import { aggregate, sourceLabel } from "@/lib/aggregate";
import { toPositions } from "@/lib/aggregate/positions";

function customer(holdings: Holding[], transactions = 0): Customer {
  return {
    id: "t",
    name: "Test",
    age: 35,
    persona: "test",
    city: "Pune",
    monthlyIncome: 120_000,
    riskProfile: "moderate",
    holdings,
    transactions: Array.from({ length: transactions }, (_, i) => ({
      date: "2026-08-01",
      category: "Uncategorised",
      amount: -1000 * (i + 1),
    })),
    goals: [{ id: "g", label: "Retirement", targetAmount: 1e7, targetYear: 2050, current: 0 }],
  };
}

const bankOnly = customer(
  [
    { assetClass: "cash", name: "IDBI Savings Account", value: 55_780 },
    { assetClass: "fd", name: "IDBI Fixed Deposit", value: 10_000 },
  ],
  20,
);

describe("aggregation", () => {
  it("counts what the bank actually supplied", () => {
    const r = aggregate(bankOnly, true);
    const by = Object.fromEntries(r.sources.map((s) => [s.kind, s]));
    expect(by.bank.status).toBe("linked");
    expect(by.deposits.status).toBe("linked");
    expect(by.spending.itemCount).toBe(20);
    expect(by.bank.provider).toContain("IDBI");
  });

  /*
   * The bank has no holdings API, so an empty stock list is *skipped*, not
   * *failed*. Failed invites someone to retry something that was never going
   * to work, and hides the real answer — that the data has to come from the
   * customer.
   */
  it("marks what IDBI cannot supply as skipped, with the reason", () => {
    const r = aggregate(bankOnly, true);
    for (const kind of ["equity", "mf", "bonds", "gold"] as const) {
      const s = r.sources.find((x) => x.kind === kind)!;
      expect(s.status, kind).toBe("skipped");
      expect(s.note).toMatch(/no holdings data/i);
    }
  });

  it("reports how much of the picture is actually there", () => {
    // Bank, deposits and spending out of seven.
    expect(aggregate(bankOnly, true).completeness).toBeCloseTo(3 / 7, 2);
    expect(aggregate(bankOnly, true).missing).toEqual(["equity", "mf", "bonds", "gold"]);
  });

  it("completes as the customer adds what the bank cannot see", () => {
    const withHoldings = customer(
      [
        ...bankOnly.holdings,
        { assetClass: "equity", name: "Infosys", value: 41_540, symbol: "INFY", quantity: 40 },
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 120_000 },
        { assetClass: "gold", name: "Sovereign Gold Bonds", value: 50_000 },
      ],
      20,
    );
    const r = aggregate(withHoldings, true);
    expect(r.completeness).toBeCloseTo(6 / 7, 2);
    expect(r.missing).toEqual(["bonds"]);
    expect(r.sources.find((s) => s.kind === "equity")!.provider).toBe("Added by you");
  });

  it("says it is demo data when it is", () => {
    expect(aggregate(bankOnly, false).sources[0].provider).toBe("Demo data");
  });

  it("names every source in words a customer would recognise", () => {
    for (const s of aggregate(bankOnly, true).sources) {
      expect(sourceLabel(s.kind)).toBeTruthy();
      expect(sourceLabel(s.kind)).not.toBe(s.kind);
    }
  });
});

/*
 * A projection over the holdings, not a second copy of them. Keeping both as
 * stored state is how the typed shape and the holdings end up disagreeing.
 */
describe("typed positions", () => {
  const rich = customer(
    [
      { assetClass: "cash", name: "IDBI Savings Account 660100100003", value: 55_780, lienAmount: 5000 },
      { assetClass: "fd", name: "IDBI Fixed Deposit", value: 10_000 },
      {
        assetClass: "equity",
        name: "Infosys",
        symbol: "INFY",
        value: 41_540,
        quantity: 40,
        lots: [{ acquiredOn: "2025-03-14", quantity: 40, costPerUnit: 820 }],
      },
      { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 120_000 },
      { assetClass: "gold", name: "Sovereign Gold Bonds", value: 50_000 },
      { assetClass: "bonds", name: "Public Provident Fund", value: 30_000 },
    ],
    5,
  );

  it("prices equity against the live quote, and P&L against what was paid", () => {
    const p = toPositions(rich, { INFY: { ltp: 1038.5, dayChangePct: -1.23 } });
    const infy = p.equity[0];
    expect(infy.avgPrice).toBe(820);
    expect(infy.lastPrice).toBe(1038.5);
    expect(infy.invested).toBe(32_800);
    expect(infy.currentValue).toBe(41_540);
    expect(infy.pnl).toBe(8_740);
    expect(infy.dayChangePct).toBe(-1.23);
  });

  it("falls back to the source's own value when there is no quote", () => {
    const p = toPositions(rich);
    expect(p.equity[0].currentValue).toBe(41_540);
    expect(p.equity[0].dayChangePct).toBeUndefined();
  });

  it("splits a deposit into what is locked and what is investible", () => {
    const savings = toPositions(rich).deposits[0];
    expect(savings.kind).toBe("SAVINGS");
    expect(savings.lienMarked).toBe(5000);
    expect(savings.investible).toBe(50_780);
  });

  /* A full account number has no business leaving the server. */
  it("masks the account number", () => {
    expect(toPositions(rich).deposits[0].accountNo).toBe("••••0003");
  });

  it("labels a fund as the look-through models it, so both agree", () => {
    expect(toPositions(rich).mutualFunds[0].category).toBe("Nifty 50 index");
  });

  it("recognises the form gold is held in", () => {
    expect(toPositions(rich).gold[0].form).toBe("sgb");
  });

  it("rides along with the aggregation", () => {
    const r = aggregate(rich, true);
    expect(r.positions.equity).toHaveLength(1);
    expect(r.positions.deposits).toHaveLength(2);
    expect(r.positions.bonds[0].name).toBe("Public Provident Fund");
  });
});

/*
 * A live *source* is not the same as live *data*. The IDBI source falls back
 * to a bundled persona when the gateway is unreachable — an IP allow-list
 * change is enough to do it — and the screen must not go on crediting the bank
 * for numbers a fixture produced.
 */
describe("provenance survives a fallback", () => {
  it("credits IDBI only when the data actually came from IDBI", () => {
    const live = { ...bankOnly, dataSource: "live" as const };
    const fell = { ...bankOnly, dataSource: "fallback" as const };

    expect(aggregate(live, true).sources[0].provider).toContain("IDBI");
    expect(aggregate(fell, true).sources[0].provider).toBe("Demo data");
  });

  it("still credits the customer for what the customer supplied", () => {
    const fell = {
      ...bankOnly,
      dataSource: "fallback" as const,
      holdings: [...bankOnly.holdings, { assetClass: "gold" as const, name: "SGB", value: 50_000 }],
    };
    expect(aggregate(fell, true).sources.find((s) => s.kind === "gold")!.provider).toBe("Added by you");
  });
});
