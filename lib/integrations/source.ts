import type { Customer, CustomerSummary } from "@/lib/data/types";
import type { CustomerRepository } from "@/lib/data/repository";
import { selectRepository } from "@/lib/data/select";
import { idbi, toCustomer } from "./idbi";
import { displayName, runConsentJourney, toKyc, type ConsentJourney, type KycProfile } from "./aa";

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
  /** AA party identifiers. Present means the consent journey can run for them. */
  mobile?: string;
  vua?: string;
  /**
   * Advisory fields core banking does not expose. `age` here is a fallback
   * only — when the AA consent is active, the real date of birth wins.
   */
  advisory: Pick<Customer, "age" | "monthlyIncome" | "riskProfile" | "goals"> & { persona?: string };
}

export const IDBI_BINDINGS: IdbiCustomerBinding[] = [
  {
    id: "priya",
    acctId: "660100100003",
    cifId: "98655854",
    fromDate: "2025-05-01T00:00:00.000",
    toDate: "2025-05-31T00:00:00.000",
    mobile: "9988776655",
    vua: "9988776655@onemoney",
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
      const customer = toCustomer(binding.id, enquiry, stmt, {
        ...advisory,
        ...(persona ? { persona } : {}),
      });

      // Identity from the AA, where the customer has consented. Age and city
      // were assumptions until this call existed; now they are the bank's own
      // record. Best-effort — core banking data stands on its own if it fails.
      const kyc = await this.kyc(binding);
      return kyc ? applyKyc(customer, kyc) : customer;
    } catch {
      return this.fallback.getCustomer(id);
    }
  }

  /**
   * Identity, cached.
   *
   * A consent is granted once and stays valid; re-running the whole journey on
   * every profile request would add three round trips to every page load for
   * data that does not change. The journey endpoint always runs live — that is
   * the demo — but the identity overlay reads through this.
   */
  private static kycCache = new Map<string, { at: number; kyc?: KycProfile }>();

  /** Run the consent journey for a bound customer. Undefined if not bound. */
  async journey(id: string): Promise<ConsentJourney | undefined> {
    const binding = this.bindings.find((b) => b.id === id);
    if (!binding?.mobile || !binding.vua) return undefined;
    return runConsentJourney({
      mobile: binding.mobile,
      accountId: binding.acctId,
      vua: binding.vua,
    });
  }

  private async kyc(binding: IdbiCustomerBinding): Promise<KycProfile | undefined> {
    if (!binding.mobile || !binding.vua) return undefined;

    const cached = IdbiSource.kycCache.get(binding.id);
    if (cached && Date.now() - cached.at < KYC_TTL_MS) return cached.kyc;

    try {
      const journey = await runConsentJourney({
        mobile: binding.mobile,
        accountId: binding.acctId,
        vua: binding.vua,
      });
      const kyc = toKyc(journey.accounts[0]);
      IdbiSource.kycCache.set(binding.id, { at: Date.now(), kyc });
      return kyc;
    } catch {
      // Cache the miss too, briefly: a sandbox outage should not mean three
      // failing round trips on every subsequent page load.
      IdbiSource.kycCache.set(binding.id, { at: Date.now(), kyc: undefined });
      return undefined;
    }
  }

  /** Test seam. */
  static clearKycCache(): void {
    IdbiSource.kycCache.clear();
  }
}

/** How long a granted consent's identity is reused before re-checking. */
const KYC_TTL_MS = 10 * 60 * 1000;

/**
 * Overlay what the AA actually knows over what we had assumed.
 *
 * Only age and city are genuine upgrades — both were hardcoded guesses before
 * the consent flow existed. The name is not: core banking returns it as
 * structured first/last, the AA as one unspaced run, so the structured form
 * wins and the AA is only a fallback.
 */
export function applyKyc(customer: Customer, kyc: KycProfile): Customer {
  return {
    ...customer,
    name: displayName(customer.name, kyc.name),
    age: kyc.age > 0 ? kyc.age : customer.age,
    city: kyc.city || customer.city,
  };
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
