import { Pool } from "pg";
import type { CustomerRepository } from "./repository";
import type {
  AssetClass,
  Customer,
  CustomerSummary,
  Goal,
  Holding,
  RiskProfile,
  Transaction,
} from "./types";

/**
 * node-postgres returns NUMERIC as a string (to avoid silent float precision
 * loss) and DATE as a JS Date. The finance layer expects numbers and ISO
 * yyyy-mm-dd strings, so every row has to be coerced on the way in — passing
 * raw rows through would produce string concatenation instead of arithmetic.
 */
export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** DATE/TIMESTAMP -> ISO yyyy-mm-dd, matching Transaction.date. */
export function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

type Row = Record<string, unknown>;

export function mapSummary(r: Row): CustomerSummary {
  return { id: String(r.id), name: String(r.name), persona: String(r.persona) };
}

export function mapHolding(r: Row): Holding {
  return {
    assetClass: String(r.asset_class) as AssetClass,
    name: String(r.name),
    value: num(r.value),
  };
}

export function mapTransaction(r: Row): Transaction {
  return {
    date: isoDate(r.date),
    category: String(r.category),
    amount: num(r.amount),
  };
}

export function mapGoal(r: Row): Goal {
  return {
    id: String(r.id),
    label: String(r.label),
    targetAmount: num(r.target_amount),
    targetYear: num(r.target_year),
    current: num(r.current_amount),
  };
}

export function assembleCustomer(
  base: Row,
  holdings: Row[],
  transactions: Row[],
  goals: Row[],
): Customer {
  return {
    id: String(base.id),
    name: String(base.name),
    age: num(base.age),
    persona: String(base.persona),
    city: String(base.city),
    monthlyIncome: num(base.monthly_income),
    riskProfile: String(base.risk_profile) as RiskProfile,
    holdings: holdings.map(mapHolding),
    transactions: transactions.map(mapTransaction),
    goals: goals.map(mapGoal),
  };
}

/**
 * Module-level pool: Next.js route handlers are invoked per-request, so a pool
 * created inside the handler would leak a pool per request and exhaust RDS
 * max_connections under any real load.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set");
    pool = new Pool({
      connectionString,
      max: num(process.env.DATABASE_POOL_MAX) || 5,
      // RDS terminates TLS with its own CA. Verifying it properly needs the
      // RDS CA bundle mounted and referenced here; DATABASE_SSL=require is the
      // pragmatic sandbox setting and should be tightened for production.
      ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

/** Test seam — drops the memoised pool so a fresh env is picked up. */
export async function resetPool(): Promise<void> {
  const existing = pool;
  pool = undefined;
  if (existing) await existing.end();
}

export class PostgresRepository implements CustomerRepository {
  name = "postgres" as const;

  async listCustomers(): Promise<CustomerSummary[]> {
    const { rows } = await getPool().query(
      "select id, name, persona from customers order by name",
    );
    return rows.map(mapSummary);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const db = getPool();
    const base = await db.query(
      `select id, name, age, persona, city, monthly_income, risk_profile
         from customers where id = $1`,
      [id],
    );
    if (base.rowCount === 0) return undefined;

    const [holdings, transactions, goals] = await Promise.all([
      db.query(
        "select asset_class, name, value from holdings where customer_id = $1 order by value desc",
        [id],
      ),
      db.query(
        "select date, category, amount from transactions where customer_id = $1 order by date",
        [id],
      ),
      db.query(
        `select id, label, target_amount, target_year, current_amount
           from goals where customer_id = $1 order by target_year`,
        [id],
      ),
    ]);

    return assembleCustomer(base.rows[0], holdings.rows, transactions.rows, goals.rows);
  }
}
