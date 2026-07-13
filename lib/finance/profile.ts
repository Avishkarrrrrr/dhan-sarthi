import { getCustomer } from "@/lib/data/customers";
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

/** Compose the full 360° profile response. Pure and unit-testable. */
export function buildProfileResponse(id: string): ProfileResponse | null {
  const customer = getCustomer(id);
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
