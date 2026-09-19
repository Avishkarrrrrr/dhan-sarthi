import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selectRepository } from "@/lib/data/select";
import { SyntheticRepository } from "@/lib/data/synthetic";
import {
  assembleCustomer,
  isoDate,
  mapGoal,
  mapHolding,
  mapSummary,
  mapTransaction,
  num,
} from "@/lib/data/postgres";

describe("repository selection", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.DATA_SOURCE;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to synthetic with no database configured", () => {
    expect(selectRepository().name).toBe("synthetic");
  });

  it("selects postgres when DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgres://u:p@h:5432/db";
    expect(selectRepository().name).toBe("postgres");
  });

  it("honours forced synthetic even when a database is configured", () => {
    process.env.DATABASE_URL = "postgres://u:p@h:5432/db";
    process.env.DATA_SOURCE = "synthetic";
    expect(selectRepository().name).toBe("synthetic");
  });

  it("honours forced postgres", () => {
    process.env.DATA_SOURCE = "postgres";
    expect(selectRepository().name).toBe("postgres");
  });
});

describe("SyntheticRepository", () => {
  const repo = new SyntheticRepository();

  it("lists the bundled personas", async () => {
    const list = await repo.listCustomers();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it("returns a full record for a known id", async () => {
    const c = await repo.getCustomer("priya");
    expect(c?.holdings.length).toBeGreaterThan(0);
    expect(c?.transactions.length).toBeGreaterThan(0);
    expect(c?.goals.length).toBeGreaterThan(0);
  });

  it("resolves undefined for an unknown id", async () => {
    expect(await repo.getCustomer("nobody")).toBeUndefined();
  });
});

describe("postgres row coercion", () => {
  // The reason this layer exists: node-postgres hands back NUMERIC as a string.
  it("converts NUMERIC strings to numbers", () => {
    expect(num("125000.50")).toBe(125000.5);
    expect(num(4200)).toBe(4200);
  });

  it("treats null/undefined/garbage as 0 rather than NaN", () => {
    // NaN would propagate silently through netWorth() and poison every figure.
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not a number")).toBe(0);
  });

  it("normalises DATE objects and strings to ISO yyyy-mm-dd", () => {
    expect(isoDate(new Date(Date.UTC(2026, 6, 13)))).toBe("2026-07-13");
    expect(isoDate("2026-07-13T00:00:00.000Z")).toBe("2026-07-13");
    expect(isoDate("2026-07-13")).toBe("2026-07-13");
  });

  it("maps a holding row, coercing value", () => {
    expect(mapHolding({ asset_class: "mutual_fund", name: "Nifty Index", value: "250000.00" }))
      .toEqual({ assetClass: "mutual_fund", name: "Nifty Index", value: 250000 });
  });

  it("preserves the sign on transaction amounts", () => {
    // Sign carries meaning: > 0 credit, < 0 debit.
    expect(mapTransaction({ date: "2026-07-01", category: "Salary", amount: "150000.00" }).amount)
      .toBe(150000);
    expect(mapTransaction({ date: "2026-07-02", category: "Rent", amount: "-35000.00" }).amount)
      .toBe(-35000);
  });

  it("maps current_amount onto Goal.current", () => {
    expect(
      mapGoal({
        id: "retirement",
        label: "Retirement",
        target_amount: "20000000.00",
        target_year: 2050,
        current_amount: "1500000.00",
      }),
    ).toEqual({
      id: "retirement",
      label: "Retirement",
      targetAmount: 20000000,
      targetYear: 2050,
      current: 1500000,
    });
  });

  it("maps a summary row", () => {
    expect(mapSummary({ id: "priya", name: "Priya Sharma", persona: "Salaried" }))
      .toEqual({ id: "priya", name: "Priya Sharma", persona: "Salaried" });
  });

  it("assembles a Customer with snake_case -> camelCase and numeric coercion", () => {
    const c = assembleCustomer(
      {
        id: "priya",
        name: "Priya Sharma",
        age: "34",
        persona: "Salaried, moderate",
        city: "Mumbai",
        monthly_income: "150000.00",
        risk_profile: "moderate",
      },
      [{ asset_class: "equity", name: "HDFC Bank", value: "80000.00" }],
      [{ date: new Date(Date.UTC(2026, 6, 1)), category: "Salary", amount: "150000.00" }],
      [
        {
          id: "home",
          label: "Home",
          target_amount: "8000000.00",
          target_year: 2032,
          current_amount: "900000.00",
        },
      ],
    );

    expect(c.age).toBe(34);
    expect(c.monthlyIncome).toBe(150000);
    expect(c.riskProfile).toBe("moderate");
    expect(c.holdings[0].value).toBe(80000);
    expect(c.transactions[0].date).toBe("2026-07-01");
    expect(c.goals[0].current).toBe(900000);
  });
});
