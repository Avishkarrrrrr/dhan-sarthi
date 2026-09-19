import type { CustomerRepository } from "./repository";
import type { Customer, CustomerSummary } from "./types";
import { getCustomer, listCustomers } from "./customers";

/**
 * The bundled demo personas. Keeps the public demo and the test suite working
 * with no database configured — the same graceful-degradation stance the LLM
 * and voice layers take.
 */
export class SyntheticRepository implements CustomerRepository {
  name = "synthetic" as const;

  async listCustomers(): Promise<CustomerSummary[]> {
    return listCustomers();
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return getCustomer(id);
  }
}
