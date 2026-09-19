import { selectRepository } from "@/lib/data/select";
import type { CustomerRepository } from "@/lib/data/repository";
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
 * Compose the full 360° profile response. The derived figures stay pure and
 * unit-testable; only the customer fetch is I/O. `repo` is injectable so tests
 * and callers can pin a source instead of depending on ambient env.
 */
export async function buildProfileResponse(
  id: string,
  repo: CustomerRepository = selectRepository(),
): Promise<ProfileResponse | null> {
  const customer = await repo.getCustomer(id);
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
