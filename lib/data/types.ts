export type AssetClass = "equity" | "mutual_fund" | "fd" | "gold" | "cash";

/** A single holding. `value` is current market value in INR. */
export interface Holding {
  assetClass: AssetClass;
  name: string;
  value: number;
}

/** A transaction. `amount` > 0 is a credit (income), < 0 is a debit (spend). */
export interface Transaction {
  date: string; // ISO yyyy-mm-dd
  category: string;
  amount: number;
}

export type RiskProfile = "conservative" | "moderate" | "aggressive";

export interface Goal {
  id: string;
  label: string;
  targetAmount: number; // INR
  targetYear: number;
  current: number; // INR already saved toward this goal
}

export interface Customer {
  id: string;
  name: string;
  age: number;
  persona: string;
  city: string;
  monthlyIncome: number; // INR
  riskProfile: RiskProfile;
  holdings: Holding[];
  transactions: Transaction[];
  goals: Goal[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  persona: string;
}
