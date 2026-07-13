import { describe, it, expect } from "vitest";
import { getCustomer, listCustomers } from "@/lib/data/customers";

describe("customer data", () => {
  it("lists at least three personas", () => {
    expect(listCustomers().length).toBeGreaterThanOrEqual(3);
  });

  it("returns a customer with holdings, transactions, goals", () => {
    const c = getCustomer(listCustomers()[0].id)!;
    expect(c).toBeDefined();
    expect(c.holdings.length).toBeGreaterThan(0);
    expect(c.transactions.length).toBeGreaterThan(0);
    expect(c.goals.length).toBeGreaterThan(0);
  });

  it("has both income credits and spend debits in transactions", () => {
    const c = getCustomer("priya")!;
    expect(c.transactions.some((t) => t.amount > 0)).toBe(true);
    expect(c.transactions.some((t) => t.amount < 0)).toBe(true);
  });

  it("returns undefined for unknown id", () => {
    expect(getCustomer("nobody")).toBeUndefined();
  });
});
