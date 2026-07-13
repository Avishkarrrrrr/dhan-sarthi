import type { Customer, CustomerSummary, Transaction } from "./types";

/**
 * Synthetic 360° customer data. Stands in for what an Account Aggregator +
 * core-banking feed would supply: holdings, categorized transactions, goals.
 * Values are in INR and chosen to be realistic for each persona.
 */

/** Build ~3 months of transactions from a monthly template (salary + spends). */
function monthlyPattern(
  monthsBack: number,
  income: number,
  spends: { category: string; amount: number }[],
): Transaction[] {
  const out: Transaction[] = [];
  const now = new Date("2026-07-01T00:00:00Z");
  for (let m = monthsBack - 1; m >= 0; m--) {
    const y = now.getUTCFullYear();
    const mm = now.getUTCMonth() - m;
    const d = new Date(Date.UTC(y, mm, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ date: `${ym}-01`, category: "Salary / Income", amount: income });
    spends.forEach((s, i) => {
      out.push({ date: `${ym}-${String(3 + i * 2).padStart(2, "0")}`, category: s.category, amount: -s.amount });
    });
  }
  return out;
}

const CUSTOMERS: Customer[] = [
  {
    id: "priya",
    name: "Priya Sharma",
    age: 32,
    persona: "Salaried IT professional, Pune",
    city: "Pune",
    monthlyIncome: 120000,
    riskProfile: "moderate",
    holdings: [
      { assetClass: "equity", name: "Direct stocks (NSE)", value: 320000 },
      { assetClass: "mutual_fund", name: "Nifty 50 Index Fund", value: 480000 },
      { assetClass: "mutual_fund", name: "Flexi-cap Fund SIP", value: 260000 },
      { assetClass: "fd", name: "Bank Fixed Deposit", value: 300000 },
      { assetClass: "gold", name: "Sovereign Gold Bonds", value: 90000 },
      { assetClass: "cash", name: "Savings account", value: 150000 },
    ],
    transactions: monthlyPattern(3, 120000, [
      { category: "Rent", amount: 32000 },
      { category: "Groceries", amount: 12000 },
      { category: "Dining / Food delivery", amount: 9500 },
      { category: "SIP / Investments", amount: 25000 },
      { category: "Shopping", amount: 8000 },
      { category: "Utilities & Bills", amount: 6000 },
      { category: "Travel / Cab", amount: 5500 },
    ]),
    goals: [
      { id: "priya-home", label: "Home down payment", targetAmount: 3000000, targetYear: 2031, current: 700000 },
      { id: "priya-retire", label: "Retirement corpus", targetAmount: 40000000, targetYear: 2053, current: 1400000 },
    ],
  },
  {
    id: "rajesh",
    name: "Rajesh Kumar",
    age: 45,
    persona: "Small business owner, Jaipur",
    city: "Jaipur",
    monthlyIncome: 260000,
    riskProfile: "aggressive",
    holdings: [
      { assetClass: "equity", name: "Direct stocks (mid & small cap)", value: 1800000 },
      { assetClass: "mutual_fund", name: "Small-cap Fund", value: 900000 },
      { assetClass: "mutual_fund", name: "ELSS Tax Saver", value: 400000 },
      { assetClass: "fd", name: "Business reserve FD", value: 500000 },
      { assetClass: "gold", name: "Physical + digital gold", value: 350000 },
      { assetClass: "cash", name: "Current + savings", value: 600000 },
    ],
    transactions: monthlyPattern(3, 260000, [
      { category: "Business expenses", amount: 60000 },
      { category: "Home loan EMI", amount: 45000 },
      { category: "Groceries", amount: 18000 },
      { category: "Dining / Entertainment", amount: 22000 },
      { category: "SIP / Investments", amount: 40000 },
      { category: "Shopping", amount: 20000 },
      { category: "Travel", amount: 15000 },
    ]),
    goals: [
      { id: "rajesh-child", label: "Child's higher education", targetAmount: 8000000, targetYear: 2035, current: 1200000 },
      { id: "rajesh-retire", label: "Retirement corpus", targetAmount: 60000000, targetYear: 2046, current: 4550000 },
    ],
  },
  {
    id: "meena",
    name: "Meena Iyer",
    age: 58,
    persona: "Senior professional nearing retirement, Chennai",
    city: "Chennai",
    monthlyIncome: 95000,
    riskProfile: "conservative",
    holdings: [
      { assetClass: "fd", name: "Fixed Deposits (laddered)", value: 2200000 },
      { assetClass: "mutual_fund", name: "Balanced Advantage Fund", value: 900000 },
      { assetClass: "equity", name: "Blue-chip stocks", value: 500000 },
      { assetClass: "gold", name: "Sovereign Gold Bonds", value: 300000 },
      { assetClass: "cash", name: "Savings + liquid fund", value: 700000 },
    ],
    transactions: monthlyPattern(3, 95000, [
      { category: "Household & Groceries", amount: 22000 },
      { category: "Medical / Insurance", amount: 12000 },
      { category: "Utilities & Bills", amount: 7000 },
      { category: "SIP / Investments", amount: 15000 },
      { category: "Dining / Leisure", amount: 6000 },
      { category: "Travel", amount: 8000 },
    ]),
    goals: [
      { id: "meena-retire", label: "Retirement income cushion", targetAmount: 12000000, targetYear: 2029, current: 4600000 },
    ],
  },
];

export function listCustomers(): CustomerSummary[] {
  return CUSTOMERS.map((c) => ({ id: c.id, name: c.name, persona: c.persona }));
}

export function getCustomer(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}
