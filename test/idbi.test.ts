import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  amt,
  idbi,
  idbiBase,
  isoDay,
  toCustomer,
  toHoldings,
  toTransaction,
  type AccountEnquiry,
  type StatementResult,
  type StatementTxn,
} from "@/lib/integrations/idbi";

// Shapes below are trimmed from real sandbox responses (account 660100100003).
const txn = (over: Partial<StatementTxn["transactionSummary"]> = {}): StatementTxn => ({
  pstdDate: "2025-05-01T10:00:00.000",
  transactionSummary: {
    txnAmt: { amountValue: "2448.28", currencyCode: "INR" },
    txnDate: "2025-05-01T00:00:00.000",
    txnDesc: "S1 TXN 1",
    txnType: "D",
    ...over,
  },
  txnBalance: { amountValue: "397551.72", currencyCode: "INR" },
  txnCat: "TCI",
  txnId: "S11001",
  txnSrlNo: "1",
  valueDate: "2025-05-01T00:00:00.000",
});

const enquiry: AccountEnquiry = {
  acctId: "660100100003",
  acctType: { schmCode: "SB002", schmType: "SAVINGS" },
  acctCurr: "INR",
  custId: "68453002",
  personName: { firstName: "PRIYA", middleName: "", lastName: "PATIL", name: "PRIYAPATIL", titlePrefix: "MS" },
  acctOpenDt: "2018-04-18T00:00:00.000",
  bankInfo: { bankId: "IDBI001", name: "IDBIBANK", branchId: "105", branchName: "PUNE", postAddr: { city: "PUNE", stateProv: "MH" } },
  acctBal: [{ balType: "LEDGER", balAmt: { amountValue: "56780.25", currencyCode: "INR" } }],
};

const stmt: StatementResult = {
  result: {
    accountBalances: {
      acid: "660100100003",
      availableBalance: { amountValue: "55780.25", currencyCode: "INR" },
      ledgerBalance: { amountValue: "56780.25", currencyCode: "INR" },
      fFDBalance: { amountValue: "10000.00", currencyCode: "INR" },
      branchId: "105",
      currencyCode: "INR",
    },
    transactionDetails: [txn(), txn({ txnType: "C", txnAmt: { amountValue: "50000.00", currencyCode: "INR" } })],
  },
};

describe("IDBI value coercion", () => {
  it("parses string amounts to numbers", () => {
    expect(amt({ amountValue: "56780.25", currencyCode: "INR" })).toBe(56780.25);
  });

  it("never yields NaN for missing or malformed amounts", () => {
    // NaN would propagate silently through netWorth() and poison every figure.
    expect(amt(undefined)).toBe(0);
    expect(amt({ amountValue: "not-a-number", currencyCode: "INR" })).toBe(0);
  });

  it("truncates IDBI timestamps to yyyy-mm-dd", () => {
    expect(isoDay("2025-05-01T00:00:00.000")).toBe("2025-05-01");
    expect(isoDay(undefined)).toBe("");
  });
});

describe("transaction mapping", () => {
  it("makes a debit negative", () => {
    // IDBI signals direction with txnType; we carry it in the sign.
    expect(toTransaction(txn({ txnType: "D" })).amount).toBe(-2448.28);
  });

  it("makes a credit positive", () => {
    expect(toTransaction(txn({ txnType: "C" })).amount).toBe(2448.28);
  });

  it("uses the txn date, and refuses to treat a reference number as a category", () => {
    const t = toTransaction(txn());
    // The sandbox describes every row as "S1 TXN 1". Charting that puts a
    // reference number on an axis labelled "where your money goes".
    expect(t.category).toBe("Uncategorised");
    expect(t.date).toBe("2025-05-01");
  });

  it("keeps a real description when the feed has one", () => {
    expect(toTransaction(txn({ txnDesc: "UPI/ZOMATO/PAY" })).category).toBe("UPI/ZOMATO/PAY");
  });
});

describe("holdings mapping", () => {
  it("maps available balance to cash and FD balance to fd", () => {
    expect(toHoldings(stmt)).toEqual([
      { assetClass: "cash", name: "IDBI Savings Account", value: 55780.25 },
      { assetClass: "fd", name: "IDBI Fixed Deposit", value: 10000 },
    ]);
  });

  it("omits a zero FD balance rather than emitting an empty holding", () => {
    const noFd: StatementResult = {
      result: {
        ...stmt.result,
        accountBalances: { ...stmt.result.accountBalances, fFDBalance: { amountValue: "0.00", currencyCode: "INR" } },
      },
    };
    expect(toHoldings(noFd)).toHaveLength(1);
  });
});

describe("customer composition", () => {
  it("builds a domain Customer from live account data", () => {
    const c = toCustomer("priya", enquiry, stmt);
    // Core banking shouts; the boundary presents it properly.
    expect(c.name).toBe("Priya Patil");
    expect(c.city).toBe("Pune");
    expect(c.holdings).toHaveLength(2);
    expect(c.transactions).toHaveLength(2);
  });

  it("lets advisory-profile fields be supplied, since the bank APIs do not expose them", () => {
    const c = toCustomer("priya", enquiry, stmt, { age: 32, monthlyIncome: 120000, riskProfile: "aggressive" });
    expect(c.age).toBe(32);
    expect(c.monthlyIncome).toBe(120000);
    expect(c.riskProfile).toBe("aggressive");
  });
});

describe("client request shapes", () => {
  const saved = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
  });

  const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
  const urlOf = () => String(fetchMock.mock.calls[0][0]);

  it("nests 394 under input with a txn flag", async () => {
    await idbi.getCustomerAccounts("98655854");
    expect(urlOf()).toContain("/getCustomerAccountsByCustIdtest");
    expect(bodyOf()).toEqual({ input: { acctType: "SBA", branchId: "105", cifId: "98655854" }, txn: "E" });
  });

  it("sends 365 as a flat acctId", async () => {
    await idbi.getAccountEnquiry("660100100003");
    expect(bodyOf()).toEqual({ acctId: "660100100003" });
  });

  it("nests 393 under input with sort order", async () => {
    await idbi.getStatement("660100100003", "2025-05-01T00:00:00.000", "2025-05-27T00:00:00.000");
    expect(bodyOf().input.acid).toBe("660100100003");
    expect(bodyOf().input.sortIn).toBe("D");
  });

  it("uses getAccountStatementtest for API 595, not the display name", async () => {
    // The portal lists this as MoneyOneFIUgetAccountStatement; that path 404s.
    await idbi.getMoneyOneStatement("CONSENT-0001", ["abc"]);
    expect(urlOf()).toContain("/getAccountStatementtest");
    expect(urlOf()).not.toContain("MoneyOneFIU");
  });

  it("defaults productID to TEST on a consent request", async () => {
    await idbi.requestConsent({
      partyIdentifierValue: "9988776655",
      accountID: "660100100003",
      vua: "9988776655@onemoney",
      transactionID: "9080",
    });
    expect(bodyOf().productID).toBe("TEST");
    expect(bodyOf().partyIdentifierType).toBe("MOBILE");
  });

  it("honours IDBI_API_BASE for pointing at another environment", async () => {
    process.env.IDBI_API_BASE = "https://example.test/UAT";
    expect(idbiBase()).toBe("https://example.test/UAT");
    await idbi.getAccountEnquiry("1");
    expect(urlOf()).toBe("https://example.test/UAT/performAccountEnquirytest");
  });

  it("surfaces the gateway's validation message on a non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "acctType is mandatory" }), { status: 400 }),
    );
    await expect(idbi.getCustomerAccounts("1")).rejects.toThrow(/acctType is mandatory/);
  });
});
