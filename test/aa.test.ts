import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ageFrom,
  balanceOf,
  displayName,
  maskPan,
  modeBreakdown,
  runConsentJourney,
  splitAddress,
  toKyc,
  toTransaction,
  transactionsOf,
  txnDate,
  type AaAccount,
} from "@/lib/integrations/aa";
import { applyKyc } from "@/lib/integrations/source";
import type { Customer } from "@/lib/data/types";

/** Shaped exactly like the live 739 response, trimmed to two transactions. */
const account: AaAccount = {
  linkReferenceNumber: "19818fc6-d5ee-429b-9d14-4dfd5d92fc8e",
  maskedAccountNumber: "XXXXXXXX0003",
  fiType: "DEPOSIT",
  bank: "IDBIBANK",
  Profile: {
    Holders: {
      type: "SINGLE",
      Holder: [
        {
          dob: "1995-06-20",
          pan: "FGHPP4567T",
          name: "PRIYAPATIL",
          email: "priya@gmail",
          mobile: "9988776655",
          address: "142, Lake View, Near City Mall, PUNE, MH, 411001",
          nominee: "REGISTERED",
          landline: "",
          ckycRegistered: "YES",
        },
      ],
    },
  },
  Summary: {
    ifsc: "IBKL0000105",
    branch: "PUNE",
    status: "ACTIVE",
    currency: "INR",
    accountType: "SBA",
    openingDate: "2018-04-18",
    currentBalance: "56780.25",
  },
  Transactions: {
    startDate: "2025-05-01",
    endDate: "2025-05-31",
    Transaction: [
      {
        mode: "OTHERS",
        type: "DEBIT",
        txnId: "F1D2001",
        amount: "868.96",
        narration: "F1 FinPro 1",
        valueDate: "2025-05-01",
        transactionTimestamp: "2025-05-01T11:00:00.000",
      },
      {
        mode: "REMITTANCE",
        type: "CREDIT",
        txnId: "F1D2003",
        amount: "14117.66",
        narration: "Salary Credit",
        valueDate: "2025-05-03",
        transactionTimestamp: "2025-05-03T11:00:00.000",
      },
    ],
  },
};

describe("identity the consent unlocks", () => {
  it("derives what core banking never returns", () => {
    const kyc = toKyc(account, new Date("2026-09-19T00:00:00Z"))!;
    expect(kyc.age).toBe(31); // from the real DOB, not a hardcoded persona
    expect(kyc.dob).toBe("1995-06-20");
    expect(kyc.city).toBe("Pune");
    expect(kyc.state).toBe("MH");
    expect(kyc.pincode).toBe("411001");
    expect(kyc.nomineeRegistered).toBe(true);
    expect(kyc.ckycCompliant).toBe(true);
    expect(kyc.ifsc).toBe("IBKL0000105");
  });

  it("counts only birthdays that have happened", () => {
    expect(ageFrom("1995-06-20", new Date("2026-06-19T00:00:00Z"))).toBe(30);
    expect(ageFrom("1995-06-20", new Date("2026-06-20T00:00:00Z"))).toBe(31);
    expect(ageFrom("", new Date())).toBe(0);
    expect(ageFrom("not-a-date", new Date())).toBe(0);
  });

  it("masks the PAN rather than carrying it around whole", () => {
    expect(maskPan("FGHPP4567T")).toBe("FG•••••67T");
    expect(maskPan("")).toBe("");
    expect(maskPan("SHORT")).toBe("••••••••••");
  });

  it("returns blanks rather than a wrong guess for an unparseable address", () => {
    expect(splitAddress("just one line")).toEqual({ city: "", state: "JUST ONE LINE", pincode: "" });
    expect(splitAddress(undefined)).toEqual({ city: "", state: "", pincode: "" });
  });

  it("accepts 595's alternative CKYC spelling", () => {
    const alt = structuredClone(account);
    delete alt.Profile!.Holders!.Holder[0].ckycRegistered;
    alt.Profile!.Holders!.Holder[0].ckycCompliance = "true";
    expect(toKyc(alt)!.ckycCompliant).toBe(true);
  });

  it("is undefined when there is no holder to read", () => {
    expect(toKyc(undefined)).toBeUndefined();
    expect(toKyc({ ...account, Profile: undefined })).toBeUndefined();
  });
});

describe("naming", () => {
  // The AA gives one unspaced run; core banking gives structured first/last.
  it("prefers the structured name over the AA's unspaced one", () => {
    expect(displayName("PRIYA PATIL", "PRIYAPATIL")).toBe("Priya Patil");
  });

  it("falls back to the AA name when there is no structured one", () => {
    expect(displayName("", "PRIYAPATIL")).toBe("Priyapatil");
  });

  it("upgrades age and city but never downgrades the name", () => {
    const customer = { name: "PRIYA PATIL", age: 32, city: "PUNE" } as Customer;
    const merged = applyKyc(customer, toKyc(account, new Date("2026-09-19T00:00:00Z"))!);
    expect(merged.name).toBe("Priya Patil");
    expect(merged.age).toBe(31);
    expect(merged.city).toBe("Pune");
  });
});

describe("transactions", () => {
  it("reads whichever timestamp field the API happened to use", () => {
    expect(txnDate({ transactionTimestamp: "2025-05-01T11:00:00.000" } as never)).toBe("2025-05-01");
    expect(txnDate({ transactionTimeStamp: "2025-05-02T11:00:00.000" } as never)).toBe("2025-05-02");
    expect(txnDate({ transactionDateTime: "2025-05-03T11:00:00.000" } as never)).toBe("2025-05-03");
    expect(txnDate({ valueDate: "2025-05-04" } as never)).toBe("2025-05-04");
  });

  it("keeps the sign convention: debits negative, credits positive", () => {
    const [debit, credit] = account.Transactions!.Transaction!.map(toTransaction);
    expect(debit.amount).toBe(-868.96);
    expect(credit.amount).toBe(14117.66);
    expect(credit.category).toBe("Salary Credit");
  });

  it("aggregates balance and the payment-rail mix", () => {
    expect(balanceOf([account])).toBe(56780.25);
    expect(transactionsOf([account])).toHaveLength(2);
    expect(modeBreakdown([account])).toEqual([
      { mode: "OTHERS", count: 1 },
      { mode: "REMITTANCE", count: 1 },
    ]);
  });
});

describe("consent journey", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  const consentList = {
    status: "SUCCESS",
    data: [
      {
        consentID: "CONSENT-0001",
        status: "ACTIVE",
        consent_handle: "handle-1",
        accountID: "660100100003",
        vua: "9988776655@onemoney",
        accounts: [{ linkReferenceNumber: "LRN0001", fipName: "IDBI", fipId: "IDBI001", accountType: "SAVINGS", maskedAccountNumber: "XXXX0003", fiType: "DEPOSIT" }],
      },
    ],
  };

  const args = { mobile: "9988776655", accountId: "660100100003", vua: "9988776655@onemoney" };

  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (/requestConsent/.test(url)) return ok({ data: { status: "PENDING", consent_handle: "handle-1" } });
        if (/getConsentList/.test(url)) return ok(consentList);
        if (/getAccountStatementFromFinPro/.test(url)) return ok({ status: "success", data: [account] });
        return ok({});
      }),
    );
  });

  it("walks 590 → 591 → 739 and records each step", async () => {
    const journey = await runConsentJourney(args);
    expect(journey.status).toBe("active");
    expect(journey.steps.map((s) => s.api)).toEqual(["590", "591", "739"]);
    expect(journey.steps.every((s) => s.ok)).toBe(true);
    expect(journey.consentId).toBe("CONSENT-0001");
    expect(journey.linkRefNumbers).toEqual(["LRN0001"]);
    expect(journey.accounts).toHaveLength(1);
  });

  it("does not fetch data when the consent is not active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (/requestConsent/.test(url)) return ok({ data: { status: "PENDING", consent_handle: "handle-1" } });
        if (/getConsentList/.test(url)) {
          return ok({ status: "SUCCESS", data: [{ ...consentList.data[0], status: "PENDING" }] });
        }
        throw new Error("must not fetch data without an active consent");
      }),
    );
    const journey = await runConsentJourney(args);
    expect(journey.status).toBe("pending");
    expect(journey.accounts).toHaveLength(0);
    expect(journey.steps.at(-1)).toMatchObject({ api: "739", ok: false });
  });

  // A half-finished journey on screen beats an exception; the caller can still
  // fall back to core banking.
  it("returns a partial journey instead of throwing when the gateway fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gateway down", { status: 502 })));
    const journey = await runConsentJourney(args);
    expect(journey.status).toBe("failed");
    expect(journey.steps).toHaveLength(1);
    expect(journey.steps[0]).toMatchObject({ api: "590", ok: false });
  });

  it("treats a missing redirect URL registration as non-fatal", async () => {
    const journey = await runConsentJourney({ ...args, redirectUrl: "https://example.test/cb" });
    // 592 is attempted and fails in the sandbox, but 591 and 739 still run.
    expect(journey.steps.map((s) => s.api)).toEqual(["590", "592", "591", "739"]);
    expect(journey.status).toBe("active");
  });
});
