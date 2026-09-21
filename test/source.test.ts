import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IdbiSource, MockSource, selectSource, type FinancialDataSource } from "@/lib/integrations/source";
import type { Customer, CustomerSummary } from "@/lib/data/types";

const enquiry = {
  acctId: "660100100003",
  acctType: { schmCode: "SB002", schmType: "SAVINGS" },
  acctCurr: "INR",
  custId: "68453002",
  personName: { firstName: "PRIYA", middleName: "", lastName: "PATIL", name: "PRIYAPATIL", titlePrefix: "MS" },
  acctOpenDt: "2018-04-18T00:00:00.000",
  bankInfo: { bankId: "IDBI001", name: "IDBIBANK", branchId: "105", branchName: "PUNE", postAddr: { city: "PUNE" } },
};

const stmt = {
  result: {
    accountBalances: {
      acid: "660100100003",
      availableBalance: { amountValue: "55780.25", currencyCode: "INR" },
      ledgerBalance: { amountValue: "56780.25", currencyCode: "INR" },
      fFDBalance: { amountValue: "10000.00", currencyCode: "INR" },
      branchId: "105",
      currencyCode: "INR",
    },
    transactionDetails: [
      {
        pstdDate: "2025-05-01T10:00:00.000",
        transactionSummary: {
          txnAmt: { amountValue: "2448.28", currencyCode: "INR" },
          txnDate: "2025-05-01T00:00:00.000",
          txnDesc: "S1 TXN 1",
          txnType: "D",
        },
        txnBalance: { amountValue: "397551.72", currencyCode: "INR" },
        txnId: "S11001",
        txnSrlNo: "1",
        valueDate: "2025-05-01T00:00:00.000",
      },
    ],
  },
};

/** A stand-in for the bundled personas, so tests never touch real data files. */
class StubSource implements FinancialDataSource {
  name = "mock" as const;
  constructor(public calls: string[] = []) {}
  async listCustomers(): Promise<CustomerSummary[]> {
    return [{ id: "priya", name: "Priya Sharma", persona: "stub" }];
  }
  async getCustomer(id: string): Promise<Customer | undefined> {
    this.calls.push(id);
    if (id !== "priya") return undefined;
    return {
      id: "priya",
      name: "Priya Sharma",
      age: 32,
      persona: "stub",
      city: "Pune",
      monthlyIncome: 120000,
      riskProfile: "moderate",
      holdings: [{ assetClass: "cash", name: "Synthetic", value: 1 }],
      transactions: [],
      goals: [],
    };
  }
}

describe("source selection", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.DATA_SOURCE;
    delete process.env.IDBI_LIVE;
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to the bundled personas", () => {
    expect(selectSource().name).toBe("mock");
  });

  it("selects IDBI when IDBI_LIVE is true", () => {
    process.env.IDBI_LIVE = "true";
    expect(selectSource().name).toBe("idbi");
  });

  it("honours an explicit DATA_SOURCE override in both directions", () => {
    process.env.DATA_SOURCE = "idbi";
    expect(selectSource().name).toBe("idbi");
    process.env.IDBI_LIVE = "true";
    process.env.DATA_SOURCE = "mock";
    expect(selectSource().name).toBe("mock");
  });
});

describe("IdbiSource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      const body = /performAccountEnquiry/.test(url) ? enquiry : stmt;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds a customer from live account data for a bound id", async () => {
    const c = await new IdbiSource().getCustomer("priya");
    expect(c?.name).toBe("Priya Patil");
    expect(c?.city).toBe("Pune");
    // Advisory fields are not in core banking, so they come from the binding.
    expect(c?.age).toBe(32);
    expect(c?.riskProfile).toBe("moderate");
    expect(c?.goals.length).toBeGreaterThan(0);
    // The debit must stay negative through the whole chain.
    expect(c?.transactions[0].amount).toBe(-2448.28);
  });

  it("delegates unbound ids to the fallback instead of calling the bank", async () => {
    const stub = new StubSource();
    const c = await new IdbiSource(undefined, stub).getCustomer("rajesh");
    expect(stub.calls).toContain("rajesh");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(c).toBeUndefined();
  });

  it("degrades to the fallback when the sandbox errors rather than failing the request", async () => {
    fetchMock.mockRejectedValue(new Error("gateway 403"));
    const stub = new StubSource();
    const c = await new IdbiSource(undefined, stub).getCustomer("priya");
    expect(c?.name).toBe("Priya Sharma"); // the synthetic persona, not a crash
  });

  it("takes the roster from the fallback, since the bank has no list endpoint", async () => {
    const list = await new IdbiSource(undefined, new StubSource()).listCustomers();
    expect(list).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("MockSource", () => {
  it("serves the bundled personas", async () => {
    const list = await new MockSource().listCustomers();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
});

describe("account discovery (API 394)", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  beforeEach(() => IdbiSource.clearKycCache());
  afterEach(() => vi.unstubAllGlobals());

  it("uses the account the CIF lookup returns, not the hardcoded one", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push(url);
        if (/getCustomerAccountsByCustId/.test(url)) {
          return ok({ numOfAccounts: "1", cifId: "98655854", customerAccountInfo: [{ acctNumber: "660100100999", acctType: "SBA", acctCurrCode: "INR", acctBalance: { amountValue: "1", currencyCode: "INR" } }] });
        }
        if (/performAccountEnquiry/.test(url)) {
          // The discovered account must be the one we then enquire on.
          expect(String(init?.body)).toContain("660100100999");
          return ok(enquiry);
        }
        return ok(stmt);
      }),
    );
    await new IdbiSource().getCustomer("priya");
    expect(asked.some((u) => /getCustomerAccountsByCustId/.test(u))).toBe(true);
  });

  it("falls back to the bound account when discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (/getCustomerAccountsByCustId/.test(url)) return new Response("boom", { status: 500 });
        if (/performAccountEnquiry/.test(url)) {
          expect(String(init?.body)).toContain("660100100003");
          return ok(enquiry);
        }
        return ok(stmt);
      }),
    );
    const c = await new IdbiSource().getCustomer("priya");
    expect(c?.name).toBe("Priya Patil");
  });
});
