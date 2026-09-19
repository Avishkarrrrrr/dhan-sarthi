import type { Customer, CustomerSummary } from "./types";

/**
 * Source of customer 360° data. Two implementations ship: `synthetic` (the
 * bundled demo personas, used for the public demo and tests) and `postgres`
 * (RDS, used for the bank sandbox deployment).
 *
 * Async by contract even though the synthetic implementation resolves
 * immediately — the interface has to accommodate a network round-trip, and
 * pretending otherwise would force a breaking change the moment RDS is wired
 * in. Server-only: never import a repository into a "use client" component.
 */
export interface CustomerRepository {
  name: "synthetic" | "postgres";
  listCustomers(): Promise<CustomerSummary[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
}
