import { describe, it, expect } from "vitest";
import type { Customer, Holding } from "@/lib/data/types";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { optimiseTax, tax as taxAgent } from "@/lib/agents/tax";
import { syntheticSnapshot } from "@/lib/market/nifty";
import {
  LTCG_ANNUAL_EXEMPTION,
  LTCG_RATE_EQUITY,
  SECTION_80C_LIMIT,
  STCG_RATE_EQUITY,
  marginalRate,
} from "@/lib/finance/tax-rules";

const NOW = new Date("2026-09-21T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

function customer(holdings: Holding[], monthlyIncome = 200_000): Customer {
  return {
    id: "t",
    name: "Test Person",
    age: 35,
    persona: "test",
    city: "Pune",
    monthlyIncome,
    riskProfile: "moderate",
    holdings,
    transactions: [],
    goals: [{ id: "g", label: "Retirement", targetAmount: 1e7, targetYear: 2050, current: 0 }],
  };
}

describe("the tax desk", () => {
  it("spots a lot about to turn long-term, and says how many days", () => {
    // 100 units bought 300 days ago at ₹100, now worth ₹200.
    const opt = optimiseTax(
      buildSnapshot(
        customer([
          {
            assetClass: "mutual_fund",
            name: "Flexi-cap Fund",
            value: 20000,
            lots: [{ acquiredOn: daysAgo(300), quantity: 100, costPerUnit: 100 }],
          },
        ]),
      ),
      NOW,
    );
    const hold = opt.actions.find((a) => a.kind === "hold_for_ltcg")!;
    expect(hold.daysToLongTerm).toBe(65);
    // The saving is the rate difference on a gain that already exists —
    // nothing has to go right for it to pay.
    expect(hold.estimatedSaving).toBe(Math.round(10000 * (STCG_RATE_EQUITY - LTCG_RATE_EQUITY)));
  });

  it("harvests long-term gains only up to the exemption", () => {
    const opt = optimiseTax(
      buildSnapshot(
        customer([
          {
            assetClass: "equity",
            name: "Blue-chip stocks",
            value: 1_000_000,
            lots: [{ acquiredOn: daysAgo(900), quantity: 1000, costPerUnit: 200 }],
          },
        ]),
      ),
      NOW,
    );
    const harvest = opt.actions.find((a) => a.kind === "ltcg_harvest")!;
    // ₹8L of long-term gain, but only ₹1.25L is exempt.
    expect(opt.unrealisedGains.longTerm).toBe(800_000);
    expect(harvest.estimatedSaving).toBe(Math.round(LTCG_ANNUAL_EXEMPTION * LTCG_RATE_EQUITY));
  });

  it("quotes the 80C saving at the customer's own slab, with its conditions", () => {
    const opt = optimiseTax(buildSnapshot(customer([{ assetClass: "cash", name: "Savings", value: 100000 }], 300_000)), NOW);
    const gap = opt.actions.find((a) => a.kind === "80c_gap")!;
    const slab = marginalRate(300_000 * 12);
    expect(opt.section80cGap).toBe(SECTION_80C_LIMIT);
    expect(gap.estimatedSaving).toBe(Math.round(SECTION_80C_LIMIT * slab));
    // A saving quoted without its regime and its lock-in is a sales line.
    expect(gap.detail).toMatch(/old regime/i);
    expect(gap.detail).toMatch(/lock/i);
  });

  /*
   * The bank's APIs carry no purchase dates, so against live IDBI data the
   * desk must say what it cannot compute instead of inventing a cost basis.
   */
  it("admits it has no cost basis rather than guessing one", () => {
    const snapshot = buildSnapshot(
      customer([
        { assetClass: "fd", name: "IDBI Term Deposit", value: 500_000 },
        { assetClass: "cash", name: "IDBI Savings Account", value: 50_000 },
      ]),
    );
    const view = taxAgent({ snapshot, market: syntheticSnapshot() });
    expect(view.agentId).toBe("tax");
    expect(view.reasoning).toMatch(/purchase dates are not in the bank's data/i);
    expect(view.sources).toContain("No cost basis available");
    // It is less sure of itself when it can see less.
    expect(view.confidence).toBeLessThan(0.6);

    const opt = optimiseTax(snapshot, NOW);
    expect(opt.unrealisedGains.longTerm).toBe(0);
    expect(opt.unrealisedGains.shortTerm).toBe(0);
  });

  it("does not tell a zero-tax customer to buy an ELSS", () => {
    const opt = optimiseTax(buildSnapshot(customer([{ assetClass: "cash", name: "Savings", value: 10000 }], 20_000)), NOW);
    expect(opt.actions.find((a) => a.kind === "80c_gap")).toBeUndefined();
  });
});
