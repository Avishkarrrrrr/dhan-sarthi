import { describe, it, expect } from "vitest";
import type { Customer, Holding } from "@/lib/data/types";
import { aggregate, sourceLabel } from "@/lib/aggregate";

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
