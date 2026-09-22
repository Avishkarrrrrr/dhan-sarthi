export type AssetClass = "equity" | "mutual_fund" | "bonds" | "fd" | "gold" | "cash";

/** One purchase. Without an acquisition date there is no holding period. */
export interface TaxLot {
  acquiredOn: string; // ISO date
  quantity: number;
  costPerUnit: number;
}

/** A single holding. `value` is current market value in INR. */
export interface Holding {
  assetClass: AssetClass;
  name: string;
  value: number;
  /** Units held, where the source knows them. Needed to price a lot. */
  quantity?: number;
  /** NSE symbol, when this holding is a listed company we can quote. */
  symbol?: string;
  /**
   * Purchase history. Optional because a bank feed does not carry it and a CAS
   * carries it only for funds — the tax desk says what it cannot compute
   * rather than assuming a cost basis.
   */
  lots?: TaxLot[];
  /**
   * Money inside this holding that is locked (IDBI API 362). Visible to the
   * customer, not available to them, and therefore not investible.
   */
  lienAmount?: number;
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
  /**
   * Where this record actually came from.
   *
   * The live source falls back to a bundled persona when the bank's gateway
   * is unreachable — which is right, because a demo should degrade rather than
   * blank — but the screen was still crediting the data to "IDBI 394 · 365".
   * Claiming the bank supplied something a fixture supplied is the one kind of
   * bug this product cannot afford.
   */
  dataSource?: "live" | "fallback";
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
