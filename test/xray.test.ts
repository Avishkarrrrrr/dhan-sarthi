import { describe, it, expect } from "vitest";
import type { Customer, Holding } from "@/lib/data/types";
import { classify, lookThrough, CATEGORY_MODELS } from "@/lib/finance/xray";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { checkPolicy } from "@/lib/compliance/rules";
import { MAX_SECTOR } from "@/lib/compliance/policy";

function customer(holdings: Holding[]): Customer {
  return {
    id: "t",
    name: "Test Person",
    age: 35,
    persona: "test",
    city: "Pune",
    monthlyIncome: 100000,
    riskProfile: "moderate",
    holdings,
    transactions: [],
    goals: [{ id: "g", label: "Retirement", targetAmount: 10000000, targetYear: 2050, current: 0 }],
  };
}

describe("classification", () => {
  it("routes fund names to the right category model", () => {
    const cases: [string, Holding["assetClass"], string][] = [
      ["Nifty 50 Index Fund", "mutual_fund", "Nifty 50 index"],
      ["Flexi-cap Fund SIP", "mutual_fund", "Flexi-cap equity"],
      ["ELSS Tax Saver", "mutual_fund", "ELSS (tax-saving equity)"],
      ["Small-cap Fund", "mutual_fund", "Small-cap equity"],
      ["Balanced Advantage Fund", "mutual_fund", "Balanced advantage (hybrid)"],
      ["Blue-chip stocks", "equity", "Large-cap equity"],
      ["Banking & PSU Fund", "mutual_fund", "Banking & financial services fund"],
    ];
    for (const [name, assetClass, label] of cases) {
      expect(classify({ name, assetClass, value: 1 })?.model.label, name).toBe(label);
    }
  });

  it("resolves a directly held company to itself", () => {
    const hit = classify({ name: "HDFC Bank shares", assetClass: "equity", value: 1 });
    expect(hit?.model.sectors).toEqual({ "Financial Services": 1 });
    expect(hit?.model.stocks).toEqual({ "HDFC Bank": 1 });
  });

  // "Liquid fund" is a fund and holds no equity at all. Matching it as an
  // equity vehicle would silently inflate the customer's measured risk.
  it("treats debt and liquid funds as holding no equity", () => {
    expect(classify({ name: "Liquid Fund", assetClass: "mutual_fund", value: 1 })?.model.equityShare).toBe(0);
    expect(CATEGORY_MODELS.debt.equityShare).toBe(0);
  });
});

describe("look-through", () => {
  it("unwraps a hybrid to its real equity share", () => {
    const lt = lookThrough(customer([{ assetClass: "mutual_fund", name: "Balanced Advantage Fund", value: 1000000 }]));
    expect(lt.headlineEquityPct).toBe(1);
    expect(lt.effectiveEquityPct).toBeCloseTo(0.65, 2);
    expect(lt.effectiveEquity).toBe(650000);
  });

  it("counts what it cannot model as unclassified instead of spreading it", () => {
    const lt = lookThrough(
      customer([
        { assetClass: "equity", name: "Direct stocks (NSE)", value: 500000 },
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 500000 },
      ]),
    );
    expect(lt.unclassifiedPct).toBeCloseTo(0.5, 2);
    // Sector weights are shares of *all* equity, so the unknown half dilutes
    // them. Financials is 37% of the index but 18.5% of this portfolio's
    // equity — the look-through understates rather than overstates.
    const fin = lt.bySector.find((s) => s.sector === "Financial Services")!;
    expect(fin.weight).toBeCloseTo(0.185, 2);
    expect(lt.vehicles.find((v) => v.name === "Direct stocks (NSE)")!.classified).toBe(false);
  });

  it("measures overlap as the money that buys a company twice", () => {
    // Two vehicles modelled on the same index: everything in the smaller one
    // duplicates the larger.
    const lt = lookThrough(
      customer([
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 700000 },
        { assetClass: "mutual_fund", name: "Sensex Index Fund", value: 300000 },
      ]),
    );
    const covered = Object.values(CATEGORY_MODELS.index.stocks).reduce((s, w) => s + w, 0);
    expect(lt.overlapPct).toBeCloseTo(covered * 0.3, 2);
  });

  it("finds no overlap between a single fund and itself", () => {
    const lt = lookThrough(customer([{ assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 1000000 }]));
    expect(lt.overlapPct).toBe(0);
  });

  it("aggregates a company held both directly and through a fund", () => {
    const lt = lookThrough(
      customer([
        { assetClass: "equity", name: "HDFC Bank", value: 100000 },
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 100000 },
      ]),
    );
    const hdfc = lt.byStock.find((s) => s.name === "HDFC Bank")!;
    // 100% of the direct line plus 11.5% of the fund, over 200,000 of holdings.
    expect(hdfc.weight).toBeCloseTo((100000 + 11500) / 200000, 3);
  });

  // A term deposit customer — the live sandbox has one — has nothing to look
  // through. That is a true answer, not a missing one, and it must not divide
  // by zero on the way to saying so.
  it("says nothing rather than something about a deposits-only customer", () => {
    const lt = lookThrough(
      customer([
        { assetClass: "fd", name: "IDBI Term Deposit", value: 500000 },
        { assetClass: "cash", name: "IDBI Savings Account", value: 50000 },
      ]),
    );
    expect(lt.bySector).toEqual([]);
    expect(lt.byStock).toEqual([]);
    expect(lt.effectiveEquityPct).toBe(0);
    expect(lt.overlapPct).toBe(0);
    expect(lt.unclassifiedPct).toBe(0);
  });

  it("survives a customer with no holdings at all", () => {
    const lt = lookThrough(customer([]));
    expect(lt.effectiveEquity).toBe(0);
    expect(lt.bySector).toEqual([]);
  });
});

describe("the sector rule, now that it has something to read", () => {
  const sectorFund = customer([
    { assetClass: "mutual_fund", name: "Banking & Financial Services Fund", value: 800000 },
    { assetClass: "fd", name: "Bank Fixed Deposit", value: 200000 },
  ]);

  it("fires on a genuinely sector-concentrated book", () => {
    const snap = buildSnapshot(sectorFund);
    const fin = snap.xray.bySector.find((s) => s.sector === "Financial Services")!;
    expect(fin.weight).toBeGreaterThan(MAX_SECTOR);

    const v = checkPolicy({ weights: snap.allocationByClass, rationale: "hold" }, snap);
    expect(v.map((x) => x.rule)).toContain("concentration.sector");
  });

  /*
   * The concentration is in holdings a class-level allocation cannot unpick.
   * Blocking on it would refuse every proposal for this customer with no way
   * out — the trap the emergency-fund rule had to be rescued from.
   */
  it("never blocks on it", () => {
    const snap = buildSnapshot(sectorFund);
    for (const growth of [0, 0.2, 0.5, 0.8]) {
      const weights = { equity: 0, mutual_fund: growth, bonds: 0, fd: 1 - growth, gold: 0, cash: 0 };
      const v = checkPolicy({ weights, rationale: "plan" }, snap);
      const sector = v.filter((x) => x.rule === "concentration.sector");
      expect(sector.every((x) => x.severity !== "high")).toBe(true);
    }
  });

  it("stays advisory unless the plan adds to the concentrated sleeve", () => {
    // Financials lands near 49% of the equity here — over the limit, but not
    // so far over that trimming is worth doing on its own.
    const snap = buildSnapshot(
      customer([
        { assetClass: "mutual_fund", name: "Banking & Financial Services Fund", value: 300000 },
        { assetClass: "mutual_fund", name: "Small-cap Fund", value: 450000 },
        { assetClass: "fd", name: "Bank Fixed Deposit", value: 250000 },
      ]),
    );
    const fin = snap.xray.bySector.find((s) => s.sector === "Financial Services")!;
    expect(fin.weight).toBeGreaterThan(0.45);
    expect(fin.weight).toBeLessThan(0.6);

    const current = snap.allocationByClass;
    const held = checkPolicy({ weights: current, rationale: "hold" }, snap).find(
      (x) => x.rule === "concentration.sector",
    );
    expect(held?.severity).toBe("low");

    const more = checkPolicy(
      { weights: { ...current, mutual_fund: 0.9, fd: 0.1 }, rationale: "add" },
      snap,
    ).find((x) => x.rule === "concentration.sector");
    expect(more?.severity).toBe("med");
  });

  it("admits how much of the equity it could not see", () => {
    const snap = buildSnapshot(
      customer([
        { assetClass: "equity", name: "Direct stocks (NSE)", value: 600000 },
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 400000 },
      ]),
    );
    const v = checkPolicy({ weights: snap.allocationByClass, rationale: "hold" }, snap);
    expect(v.map((x) => x.rule)).toContain("concentration.look_through_gap");
  });

  it("flags two funds that buy the same companies", () => {
    const snap = buildSnapshot(
      customer([
        { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 500000 },
        { assetClass: "mutual_fund", name: "Sensex Index Fund", value: 500000 },
      ]),
    );
    const v = checkPolicy({ weights: snap.allocationByClass, rationale: "hold" }, snap);
    expect(v.map((x) => x.rule)).toContain("concentration.overlap");
  });
});
