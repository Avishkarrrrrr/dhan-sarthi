import type { Customer, CustomerSummary } from "@/lib/data/types";
import type { CustomerRepository } from "@/lib/data/repository";
import { selectRepository } from "@/lib/data/select";
import { idbi, lienAmount, titleCase, toCustomer } from "./idbi";
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
  /** Home branch. Statements are scoped to it — Pune 105, Mumbai 106, Delhi 107. */
  branchId?: string;
  /** Shown while the real name is still being fetched, and if the fetch fails. */
  label: string;
  /** AA party identifiers. Present means the consent journey can run for them. */
  mobile?: string;
  vua?: string;
  /** Account type to look for when discovering accounts by CIF (API 394). */
  acctType?: string;
  /**
   * Advisory fields core banking does not expose. `age` here is a fallback
   * only — when the AA consent is active, the real date of birth wins.
   */
  advisory: Pick<Customer, "age" | "monthlyIncome" | "riskProfile" | "goals"> & { persona?: string };
}

/**
 * The customers that actually exist in the IDBI sandbox, found by probing the
 * account-enquiry API rather than assumed.
 *
 * They are deliberately uneven, and that is the point: Priya has a full
 * picture, Arjun has balances but no transaction history, and Neha is a term
 * deposit with no statement at all. Real customers arrive in exactly that
 * condition, and advice that only works for the complete one is not advice.
 */
export const IDBI_BINDINGS: IdbiCustomerBinding[] = [
  {
    id: "priya",
    acctId: "660100100003",
    cifId: "98655854",
    fromDate: "2025-05-01T00:00:00.000",
    toDate: "2025-05-31T00:00:00.000",
    branchId: "105",
    label: "Priya Patil",
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
  {
    id: "arjun",
    acctId: "660100100004",
    cifId: "77712345",
    branchId: "106",
    label: "Arjun Mehta",
    fromDate: "2025-05-01T00:00:00.000",
    toDate: "2025-05-31T00:00:00.000",
    advisory: {
      age: 41,
      monthlyIncome: 260000,
      riskProfile: "aggressive",
      persona: "Business owner, Mumbai",
      goals: [
        { id: "retirement", label: "Retirement", targetAmount: 50000000, targetYear: 2045, current: 1200000 },
        { id: "education", label: "Children's education", targetAmount: 8000000, targetYear: 2034, current: 900000 },
      ],
    },
  },
  {
    id: "neha",
    acctId: "660100100008",
    cifId: "88823456",
    branchId: "107",
    label: "Neha Singh",
    fromDate: "2025-05-01T00:00:00.000",
    toDate: "2025-05-31T00:00:00.000",
    advisory: {
      age: 58,
      monthlyIncome: 95000,
      riskProfile: "conservative",
      persona: "Senior professional, Delhi",
      goals: [
        { id: "retirement", label: "Retirement income", targetAmount: 15000000, targetYear: 2031, current: 500000 },
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

  /**
   * The roster, named by the bank.
   *
   * The bank has no "list my customers" call, so the ids come from the
   * bindings — but the *names* are fetched, because the switcher previously
   * showed bundled names ("Priya Sharma") beside a live profile for someone
   * else ("Priya Patil"), which reads as a bug in front of anyone paying
   * attention. Falls back to the binding label if the lookup fails.
   */
  async listCustomers(): Promise<CustomerSummary[]> {
    return Promise.all(
      this.bindings.map(async (b) => {
        let name = b.label;
        try {
          const enquiry = await idbi.getAccountEnquiry(b.acctId);
          const p = enquiry.personName;
          const joined = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ").trim();
          if (joined) name = titleCase(joined);
        } catch {
          // Keep the label; a roster that fails to render is worse than one
          // with a slightly stale name.
        }
        return { id: b.id, name, persona: b.advisory.persona ?? "IDBI customer" };
      }),
    );
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const binding = this.bindings.find((b) => b.id === id);
    if (!binding) return this.fallback.getCustomer(id);

    try {
      // Discover the customer's accounts from their CIF (API 394) rather than
      // trusting a hardcoded account number. This is how a real integration
      // works — a CIF is the identity, the account list is a lookup — and it
      // means a customer with a different or additional account still
      // resolves. Falls back to the bound account if discovery fails.
      const acctId = await this.resolveAccount(binding);

      /*
       * The enquiry is required; the statement is not.
       *
       * A term deposit has no statement to give — the API answers
       * 400 "Data not found" — and treating that as a failed customer meant
       * a real IDBI account holder vanished and fell through to a synthetic
       * persona that did not exist, so the screen said "Unknown customer".
       * Identity and balances come from the enquiry; the statement only adds
       * transaction history.
       */
      const [enquiryResult, stmtResult, lienResult] = await Promise.allSettled([
        idbi.getAccountEnquiry(acctId),
        idbi.getStatement(acctId, binding.fromDate, binding.toDate, binding.branchId ?? "105"),
        // API 362. IDBI's own annotation on it reads "showing investible vs
        // locked balance in wealth advisory" — they built it for this.
        idbi.getAccountLien(acctId),
      ]);

      if (enquiryResult.status === "rejected") throw enquiryResult.reason;
      const enquiry = enquiryResult.value;
      const stmt =
        stmtResult.status === "fulfilled"
          ? stmtResult.value
          : ({ result: { accountBalances: {}, transactionDetails: [] } } as never);
      const { persona, ...advisory } = binding.advisory;
      const customer = toCustomer(binding.id, enquiry, stmt, {
        ...advisory,
        ...(persona ? { persona } : {}),
      });

      /*
       * Mark the lien against the account it sits on. A term deposit answers
       * "Data not found" here exactly as it does for the statement, so a
       * missing lien means no lien — not a failed customer.
       */
      const locked = lienResult.status === "fulfilled" ? lienAmount(lienResult.value) : 0;
      if (locked > 0) {
        const account = customer.holdings.find((h) => h.assetClass === "cash")
          ?? customer.holdings.find((h) => h.assetClass === "fd");
        if (account) account.lienAmount = locked;
      }

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

  /**
   * The account to advise on, discovered from the CIF via API 394.
   *
   * Cached with the identity: the account list does not change between page
   * loads, and this sits in front of every profile request.
   */
  private static acctCache = new Map<string, { at: number; acctId: string }>();

  private async resolveAccount(binding: IdbiCustomerBinding): Promise<string> {
    const cached = IdbiSource.acctCache.get(binding.id);
    if (cached && Date.now() - cached.at < KYC_TTL_MS) return cached.acctId;

    try {
      const res = await idbi.getCustomerAccounts(binding.cifId, binding.acctType ?? "SBA");
      const found = res.customerAccountInfo?.[0]?.acctNumber;
      const acctId = found || binding.acctId;
      IdbiSource.acctCache.set(binding.id, { at: Date.now(), acctId });
      return acctId;
    } catch {
      return binding.acctId;
    }
  }

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

  /** Test seam — both caches are static, so both must be cleared. */
  static clearKycCache(): void {
    IdbiSource.kycCache.clear();
    IdbiSource.acctCache.clear();
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
