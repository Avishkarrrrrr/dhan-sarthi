/**
 * IDBI sandbox API client.
 *
 * Endpoints and payload shapes are taken verbatim from the Atlas Developer
 * Portal specs (innobox.idbi.bank.in) and verified against the live sandbox.
 * The gateway takes no authentication — access is controlled by IP allow-list
 * — so there is no token handling here by design.
 *
 * Note the 595 path is `getAccountStatementtest`, NOT
 * `MoneyOneFIUgetAccountStatementtest` as the API's display name suggests.
 */
import type { AssetClass, Customer, Holding, Transaction } from "@/lib/data/types";

const DEFAULT_BASE = "https://sandboxpocgatewayprod.idbi.bank.in/Development";

export function idbiBase(): string {
  return process.env.IDBI_API_BASE || DEFAULT_BASE;
}

/** Money is returned as a string everywhere; never do arithmetic on it raw. */
export interface IdbiAmount {
  amountValue: string;
  currencyCode: string;
}

export interface AccountEnquiry {
  acctId: string;
  acctType: { schmCode: string; schmType: string };
  acctCurr: string;
  custId: string;
  personName: { firstName: string; middleName: string; lastName: string; name: string; titlePrefix: string };
  acctOpenDt: string;
  bankInfo?: { bankId: string; name: string; branchId: string; branchName: string; postAddr?: { city?: string; stateProv?: string } };
  acctBal?: { balType: string; balAmt: IdbiAmount }[];
}

export interface StatementTxn {
  pstdDate: string;
  transactionSummary: { txnAmt: IdbiAmount; txnDate: string; txnDesc: string; txnType: string; instrumentId?: string };
  txnBalance: IdbiAmount;
  txnCat?: string;
  txnId: string;
  txnSrlNo: string;
  valueDate: string;
}

export interface StatementResult {
  result: {
    accountBalances: {
      acid: string;
      availableBalance: IdbiAmount;
      ledgerBalance: IdbiAmount;
      fFDBalance?: IdbiAmount;
      branchId: string;
      currencyCode: string;
    };
    hasMoreData?: string | boolean;
    transactionDetails: StatementTxn[];
  };
}

export interface CustomerAccounts {
  numOfAccounts: string;
  customerAccountInfo: { acctNumber: string; acctType: string; acctCurrCode: string; acctBalance: IdbiAmount }[];
  cifId: string;
}

export interface ConsentHandleResponse {
  ver: string;
  status: string;
  data: { status: string; consent_handle: string };
}

// ---- Account Aggregator payloads (APIs 739 / 595) ----

/**
 * The account holder as the AA network reports them. This is the only place
 * the bank gives us identity — date of birth, PAN, address, nominee and CKYC
 * status are all absent from core banking.
 */
export interface AaHolder {
  name: string;
  dob: string; // yyyy-mm-dd
  mobile: string;
  email: string;
  pan: string;
  address: string;
  nominee: string;
  landline?: string;
  /** 739 spells this `ckycRegistered` ("YES"), 595 `ckycCompliance` ("true"). */
  ckycRegistered?: string;
  ckycCompliance?: string;
}

/**
 * An AA transaction. Richer than the core-banking statement: it carries the
 * payment rail (`mode`) and a real narration instead of a serial description.
 *
 * The timestamp field name differs between the two APIs — 739 returns
 * `transactionTimestamp`, 595 `transactionTimeStamp` and `transactionDateTime`.
 * Read all three; trusting one silently loses every date on the other API.
 */
export interface AaTransaction {
  txnId: string;
  type: string; // DEBIT | CREDIT
  mode: string; // UPI | NEFT | REMITTANCE | OTHERS | ...
  amount: string;
  narration: string;
  reference?: string;
  currentBalance?: string;
  balance?: string;
  valueDate: string;
  transactionTimestamp?: string;
  transactionTimeStamp?: string;
  transactionDateTime?: string;
}

export interface AaAccount {
  linkReferenceNumber: string;
  maskedAccountNumber: string;
  fiType: string; // DEPOSIT in this sandbox
  bank: string;
  Profile?: { Holders?: { type: string; Holder: AaHolder[] } };
  Summary?: {
    currentBalance?: string;
    currency?: string;
    accountType?: string;
    accountSubType?: string;
    branch?: string;
    ifsc?: string;
    ifscCode?: string;
    micrCode?: string;
    openingDate?: string;
    status?: string;
    balanceDateTime?: string;
  };
  Transactions?: { startDate?: string; endDate?: string; Transaction?: AaTransaction[] };
}

export interface AaStatementResponse {
  ver: string;
  status: string;
  data?: AaAccount[];
  errorCode?: string | null;
  errorMsg?: string | null;
}

/** A consent as 591 reports it, including the accounts it covers. */
export interface ConsentListEntry {
  consentID: string;
  status: string;
  consent_handle: string;
  productID?: string;
  accountID: string;
  aaId?: string;
  vua: string;
  consentCreationData?: string;
  accounts?: {
    fipName: string;
    fipId: string;
    accountType: string;
    linkReferenceNumber: string;
    maskedAccountNumber: string;
    fiType: string;
  }[];
}

export interface ConsentListResponse {
  status: string;
  ver: string;
  data: ConsentListEntry[];
  errorCode?: string | null;
  errorMsg?: string | null;
}

/** `amountValue` arrives as a string; parse defensively so a bad value is 0, never NaN. */
export function amt(a: IdbiAmount | undefined | null): number {
  if (!a) return 0;
  const n = Number(a.amountValue);
  return Number.isFinite(n) ? n : 0;
}

/** "PRIYA PATIL" → "Priya Patil". Leaves already-cased text alone. */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .trim();
}

/** IDBI timestamps are `2025-05-01T00:00:00.000`; our domain wants yyyy-mm-dd. */
export function isoDay(value: string | undefined | null): string {
  return String(value ?? "").slice(0, 10);
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${idbiBase()}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    // The gateway returns {"message":"..."} for schema violations — surface it,
    // since the messages name the offending field and are genuinely useful.
    throw new Error(`IDBI ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export const idbi = {
  /** API 394 — accounts held by a customer. */
  getCustomerAccounts(cifId: string, acctType = "SBA", branchId = "105", signal?: AbortSignal) {
    return post<CustomerAccounts>(
      "getCustomerAccountsByCustIdtest",
      { input: { acctType, branchId, cifId }, txn: "E" },
      signal,
    );
  },

  /** API 365 — account holder identity, scheme and balances. */
  getAccountEnquiry(acctId: string, signal?: AbortSignal) {
    return post<AccountEnquiry>("performAccountEnquirytest", { acctId }, signal);
  },

  /** API 393 — full statement for a period. */
  getStatement(
    acid: string,
    fromDate: string,
    toDate: string,
    branchId = "105",
    signal?: AbortSignal,
  ) {
    return post<StatementResult>(
      "getFullAccountStatementWithPaginationtest",
      { input: { acid, branchId, fromDate, toDate, sortIn: "D" } },
      signal,
    );
  },

  // ---- Account Aggregator (FinPro) consent flow ----

  /** API 590 — raise a consent request; returns a consent handle. */
  requestConsent(
    args: { partyIdentifierValue: string; accountID: string; vua: string; transactionID: string; productID?: string },
    signal?: AbortSignal,
  ) {
    return post<ConsentHandleResponse>(
      "requestConsentFromFinProtest",
      {
        partyIdentifierType: "MOBILE",
        partyIdentifierValue: args.partyIdentifierValue,
        productID: args.productID ?? "TEST",
        accountID: args.accountID,
        vua: args.vua,
        transactionID: args.transactionID,
      },
      signal,
    );
  },

  /** API 591 — consents already granted for this party. */
  getConsentList(
    args: { partyIdentifierValue: string; accountID: string; vua: string; productID?: string },
    signal?: AbortSignal,
  ) {
    return post<ConsentListResponse>(
      "getConsentListFromFinProtest",
      {
        partyIdentifierType: "MOBILE",
        partyIdentifierValue: args.partyIdentifierValue,
        productID: args.productID ?? "TEST",
        accountID: args.accountID,
        vua: args.vua,
      },
      signal,
    );
  },

  /** API 592 — encrypted redirect URL to send the customer to for approval. */
  getConsentRedirectUrl(consentHandle: string, redirectUrl: string, signal?: AbortSignal) {
    return post<Record<string, unknown>>(
      "getWebRedirectionEncryptedURLtest",
      { consentHandle, redirectUrl },
      signal,
    );
  },

  /** API 739 — AA-sourced account data under an approved consent. */
  getAaStatement(consentId: string, linkRefNumber: string[], signal?: AbortSignal) {
    return post<AaStatementResponse>(
      "getAccountStatementFromFinProtest",
      { consentId, linkRefNumber },
      signal,
    );
  },

  /** API 595 — MoneyOne FIU statement. Path differs from the display name. */
  getMoneyOneStatement(consentId: string, linkRefNumber: string[], signal?: AbortSignal) {
    return post<AaStatementResponse>("getAccountStatementtest", { consentId, linkRefNumber }, signal);
  },
};

// ---------- mapping IDBI responses onto the app's domain types ----------

/**
 * IDBI marks direction with `txnType`: "D" debit, "C" credit. Our Transaction
 * carries the sign instead (> 0 credit, < 0 debit) and the finance layer relies
 * on that, so the sign must be applied here — dropping it would turn every
 * spend into income.
 */
export function toTransaction(t: StatementTxn): Transaction {
  const value = amt(t.transactionSummary.txnAmt);
  const isDebit = (t.transactionSummary.txnType || "").toUpperCase().startsWith("D");
  return {
    date: isoDay(t.transactionSummary.txnDate || t.valueDate),
    category: t.transactionSummary.txnDesc || t.txnCat || "Other",
    amount: isDebit ? -Math.abs(value) : Math.abs(value),
  };
}

/** Savings balance becomes cash; any fixed-deposit balance becomes an FD holding. */
export function toHoldings(stmt: StatementResult): Holding[] {
  const b = stmt.result.accountBalances;
  const out: Holding[] = [];
  const cash = amt(b.availableBalance);
  if (cash > 0) out.push({ assetClass: "cash" as AssetClass, name: "IDBI Savings Account", value: cash });
  const fd = amt(b.fFDBalance);
  if (fd > 0) out.push({ assetClass: "fd" as AssetClass, name: "IDBI Fixed Deposit", value: fd });
  return out;
}

/**
 * Compose a domain Customer from live IDBI data. Fields the bank APIs do not
 * expose (risk profile, goals, declared income) are supplied by the caller —
 * they belong to the advisory profile, not the core banking record.
 */
export function toCustomer(
  id: string,
  enquiry: AccountEnquiry,
  stmt: StatementResult,
  overrides: Partial<Customer> = {},
): Customer {
  const p = enquiry.personName;
  const raw = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ").trim() || p.name;
  // Core banking returns "PRIYA PATIL" and "PUNE". Shouting the customer's own
  // name back at them is a presentation bug, and it used to be fixed only when
  // the Account Aggregator journey happened to succeed — so a sandbox hiccup
  // changed how the customer's name was spelled on screen.
  const name = titleCase(raw);
  const city = titleCase(enquiry.bankInfo?.postAddr?.city || enquiry.bankInfo?.branchName || "");
  return {
    id,
    name,
    age: overrides.age ?? 0,
    persona: overrides.persona ?? `${enquiry.acctType.schmType} customer, ${city}`,
    city,
    monthlyIncome: overrides.monthlyIncome ?? 0,
    riskProfile: overrides.riskProfile ?? "moderate",
    holdings: overrides.holdings ?? toHoldings(stmt),
    transactions: overrides.transactions ?? stmt.result.transactionDetails.map(toTransaction),
    goals: overrides.goals ?? [],
  };
}
