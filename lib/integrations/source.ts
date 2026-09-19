import type { Customer, CustomerSummary } from "@/lib/data/types";
import type { CustomerRepository } from "@/lib/data/repository";
import { selectRepository } from "@/lib/data/select";
import { idbi, toCustomer } from "./idbi";

/**
 * Where a customer's 360° view comes from. `mock` serves the bundled demo
 * personas; `idbi` reads the live IDBI sandbox APIs. Both satisfy the same
 * interface, so switching is configuration, not code.
 */
export interface FinancialDataSource {
  name: "mock" | "idbi";
  listCustomers(): Promise<CustomerSummary[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
}

/** The bundled personas, delegating to the existing repository layer. */
export class MockSource implements FinancialDataSource {
  name = "mock" as const;
  constructor(private repo: CustomerRepository = selectRepository()) {}

  listCustomers(): Promise<CustomerSummary[]> {
    return this.repo.listCustomers();
  }

  getCustomer(id: string): Promise<Customer | undefined> {
    return this.repo.getCustomer(id);
  }
}

/**
 * One customer that exists in the IDBI sandbox. The bank APIs are keyed by
 * account and CIF, not by our persona ids, so the mapping is declared here.
 * Advisory fields (age, income, risk, goals) are not exposed by core banking,
 * so they are carried alongside and merged in.
 */
export interface IdbiCustomerBinding {
  id: string;
  acctId: string;
  cifId: string;
  /** Statement window. The sandbox holds May 2025 data. */
  fromDate: string;
  toDate: string;
  advisory: Pick<Customer, "age" | "monthlyIncome" | "riskProfile" | "goals"> & { persona?: string };
}

export const IDBI_BINDINGS: IdbiCustomerBinding[] = [
  {
    id: "priya",
    acctId: "660100100003",
    cifId: "98655854",
    fromDate: "2025-05-01T00:00:00.000",
    toDate: "2025-05-31T00:00:00.000",
    advisory: {
      age: 32,
      monthlyIncome: 120000,
      riskProfile: "moderate",
      persona: "Salaried IT professional, Pune",
      goals: [
        { id: "retirement", label: "Retirement", targetAmount: 20000000, targetYear: 2053, current: 450000 },
        { id: "home", label: "Home down payment", targetAmount: 3000000, targetYear: 2030, current: 600000 },
      ],
    },
  },
];

/**
 * Live IDBI sandbox source.
 *
 * Falls back to the mock source per-customer rather than failing the request:
 * a sandbox outage should degrade the demo to synthetic data, not blank the
 * screen — the same stance the LLM and voice layers take.
 */
export class IdbiSource implements FinancialDataSource {
  name = "idbi" as const;
  constructor(
    private bindings: IdbiCustomerBinding[] = IDBI_BINDINGS,
    private fallback: FinancialDataSource = new MockSource(),
  ) {}

  async listCustomers(): Promise<CustomerSummary[]> {
    // The roster still comes from the mock source: the bank APIs have no
    // "list my demo customers" call, and only bound ids resolve to live data.
    return this.fallback.listCustomers();
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const binding = this.bindings.find((b) => b.id === id);
    if (!binding) return this.fallback.getCustomer(id);

    try {
      const [enquiry, stmt] = await Promise.all([
        idbi.getAccountEnquiry(binding.acctId),
        idbi.getStatement(binding.acctId, binding.fromDate, binding.toDate),
      ]);
      const { persona, ...advisory } = binding.advisory;
      return toCustomer(binding.id, enquiry, stmt, { ...advisory, ...(persona ? { persona } : {}) });
    } catch {
      return this.fallback.getCustomer(id);
    }
  }
}

/**
 * Choose a source from env. Explicit DATA_SOURCE wins; otherwise IDBI when
 * IDBI_LIVE is set, else the bundled personas. Mirrors lib/llm/select.ts and
 * lib/data/select.ts.
 */
export function selectSource(): FinancialDataSource {
  const forced = (process.env.DATA_SOURCE || "").toLowerCase().trim();
  if (forced === "idbi") return new IdbiSource();
  if (forced === "mock" || forced === "synthetic") return new MockSource();
  if (process.env.IDBI_LIVE === "true") return new IdbiSource();
  return new MockSource();
}
