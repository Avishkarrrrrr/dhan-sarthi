import { selectSource } from "@/lib/integrations/source";
import type { Customer } from "@/lib/data/types";
import {
  allocation,
  computeNudges,
  monthlySurplus,
  netWorth,
  spendingInsights,
  type AllocationSlice,
  type Nudge,
  type SpendingSlice,
} from "./metrics";

export interface ProfileResponse {
  customer: Customer;
  netWorth: number;
  monthlySurplus: number;
  allocation: AllocationSlice[];
  spendingInsights: SpendingSlice[];
  nudges: Nudge[];
}

/**
 * Anything that can resolve a customer by id. Both `CustomerRepository` and
 * `FinancialDataSource` satisfy this, so the profile builder is not coupled to
 * either one.
 */
export interface CustomerLookup {
  getCustomer(id: string): Promise<Customer | undefined>;
}

/**
 * Compose the full 360° profile response. The derived figures stay pure and
 * unit-testable; only the customer fetch is I/O. `source` is injectable so
 * tests and callers can pin one instead of depending on ambient env.
 */
export async function buildProfileResponse(
  id: string,
  source: CustomerLookup = selectSource(),
): Promise<ProfileResponse | null> {
  const customer = await source.getCustomer(id);
  if (!customer) return null;
  return {
    customer,
    netWorth: netWorth(customer),
    monthlySurplus: monthlySurplus(customer),
    allocation: allocation(customer),
    spendingInsights: spendingInsights(customer),
    nudges: computeNudges(customer),
  };
}
