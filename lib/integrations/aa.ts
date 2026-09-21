import type { Transaction } from "@/lib/data/types";
import {
  amt,
  idbi,
  isoDay,
  type AaAccount,
  type AaHolder,
  type AaStatementResponse,
  type AaTransaction,
  type ConsentListEntry,
} from "./idbi";

/**
 * The Account Aggregator consent journey, against IDBI's FinPro sandbox.
 *
 * This is the flow a real AA integration follows, and each step here is a real
 * call to the bank's gateway rather than a mock:
 *
 *   590  request consent          → consent handle, status PENDING
 *   592  web redirect URL         → where the customer approves it
 *   591  list consents            → the handle is now ACTIVE, with linked accounts
 *   739  fetch financial data     → profile + transactions under that consent
 *
 * The journey is recorded step by step because showing it is the point: a bank
 * evaluating this needs to see consent actually being asked for and granted,
 * not data appearing from nowhere.
 */

export type JourneyStatus = "active" | "pending" | "failed";

export interface JourneyStep {
  /** The bank's own API number, so the trace is auditable against their catalogue. */
  api: string;
  label: string;
  ok: boolean;
  detail: string;
  at: string;
}

export interface ConsentJourney {
  status: JourneyStatus;
  steps: JourneyStep[];
  consentHandle?: string;
  consentId?: string;
  linkRefNumbers: string[];
  accounts: AaAccount[];
  redirectUrl?: string;
}

export interface JourneyArgs {
  /** Registered mobile — the AA party identifier. */
  mobile: string;
  /** Account the consent is scoped to. */
  accountId: string;
  /** Virtual user address at the AA, e.g. `9988776655@onemoney`. */
  vua: string;
  /** Where the customer returns after approving. Optional; 592 is best-effort. */
  redirectUrl?: string;
  transactionId?: string;
  signal?: AbortSignal;
}

function step(api: string, label: string, ok: boolean, detail: string): JourneyStep {
  return { api, label, ok, detail, at: new Date().toISOString() };
}

/**
 * Run the consent journey end to end.
 *
 * Never throws: a partial journey with the failing step marked is far more
 * useful on screen than an exception, and the caller can still fall back to
 * core banking. API 592 is explicitly best-effort — the sandbox only accepts a
 * pre-registered redirect URL, and not having one must not stop the flow.
 */
export async function runConsentJourney(args: JourneyArgs): Promise<ConsentJourney> {
  const { mobile, accountId, vua, signal } = args;
  const steps: JourneyStep[] = [];
  const journey: ConsentJourney = { status: "pending", steps, linkRefNumbers: [], accounts: [] };

  // 590 — ask for consent.
  try {
    const res = await idbi.requestConsent(
      {
        partyIdentifierValue: mobile,
        accountID: accountId,
        vua,
        transactionID: args.transactionId ?? `DHAN-${Date.now()}`,
      },
      signal,
    );
    journey.consentHandle = res.data?.consent_handle;
    steps.push(
      step("590", "Consent requested", true, `Handle ${journey.consentHandle} · ${res.data?.status}`),
    );
  } catch (e) {
    steps.push(step("590", "Consent requested", false, message(e)));
    journey.status = "failed";
    return journey;
  }

  // 592 — the approval URL the customer is sent to. Best-effort.
  if (journey.consentHandle && args.redirectUrl) {
    try {
      const res = await idbi.getConsentRedirectUrl(journey.consentHandle, args.redirectUrl, signal);
      journey.redirectUrl = typeof res?.url === "string" ? res.url : undefined;
      steps.push(step("592", "Approval URL issued", true, journey.redirectUrl ?? "URL generated"));
    } catch (e) {
      steps.push(
        step("592", "Approval URL issued", false, `${message(e)} (redirect URL must be pre-registered)`),
      );
    }
  }

  // 591 — has it been approved?
  let consent: ConsentListEntry | undefined;
  try {
    const res = await idbi.getConsentList({ partyIdentifierValue: mobile, accountID: accountId, vua }, signal);
    const all = res.data ?? [];
    consent =
      all.find((c) => c.consent_handle === journey.consentHandle && isActive(c)) ??
      all.find(isActive) ??
      all[0];
    journey.consentId = consent?.consentID;
    journey.linkRefNumbers = (consent?.accounts ?? []).map((a) => a.linkReferenceNumber);
    steps.push(
      step(
        "591",
        "Consent status checked",
        Boolean(consent),
        consent
          ? `${consent.consentID} · ${consent.status} · ${journey.linkRefNumbers.length} linked account(s)`
          : "No consent found for this party",
      ),
    );
  } catch (e) {
    steps.push(step("591", "Consent status checked", false, message(e)));
    journey.status = "failed";
    return journey;
  }

  if (!consent || !isActive(consent)) {
    steps.push(step("739", "Financial data fetched", false, "Skipped — consent is not active"));
    return journey;
  }

  // 739 — fetch the data the consent covers.
  try {
    const res = await idbi.getAaStatement(consent.consentID, journey.linkRefNumbers, signal);
    journey.accounts = res.data ?? [];
    journey.status = "active";
    steps.push(
      step(
        "739",
        "Financial data fetched",
        true,
        `${journey.accounts.length} account(s), ${countTxns(journey.accounts)} transactions`,
      ),
    );
  } catch (e) {
    steps.push(step("739", "Financial data fetched", false, message(e)));
    journey.status = "failed";
  }

  /*
   * 595 — the MoneyOne FIU route to the same consent.
   *
   * Two FIUs serve this sandbox and they do not return identical data: 739
   * carries twenty transactions with reference-number narration, 595 fewer but
   * with real descriptions ("Salary Credit"). Asking the second only when the
   * first came back empty keeps one fetch in the normal case while still
   * surviving one FIU being down — which is the actual reason a production AA
   * integration talks to more than one.
   */
  if (!journey.accounts.length) {
    try {
      const res = await idbi.getMoneyOneStatement(consent.consentID, journey.linkRefNumbers, signal);
      journey.accounts = res.data ?? [];
      if (journey.accounts.length) journey.status = "active";
      steps.push(
        step(
          "595",
          "Second FIU queried",
          journey.accounts.length > 0,
          journey.accounts.length
            ? `${journey.accounts.length} account(s), ${countTxns(journey.accounts)} transactions`
            : "No data from the secondary FIU either",
        ),
      );
    } catch (e) {
      steps.push(step("595", "Second FIU queried", false, message(e)));
    }
  }

  return journey;
}

function isActive(c: ConsentListEntry): boolean {
  return (c.status || "").toUpperCase() === "ACTIVE";
}

function countTxns(accounts: AaAccount[]): number {
  return accounts.reduce((s, a) => s + (a.Transactions?.Transaction?.length ?? 0), 0);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : String(e);
}

// ---- Identity ----

/**
 * What the AA tells us about the person, which core banking does not. Age and
 * city in particular were hardcoded assumptions before this existed.
 */
export interface KycProfile {
  name: string;
  dob: string;
  age: number;
  maskedPan: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  nomineeRegistered: boolean;
  ckycCompliant: boolean;
  maskedAccountNumber: string;
  ifsc: string;
  branch: string;
  accountOpenDate: string;
}

export function firstHolder(account: AaAccount | undefined): AaHolder | undefined {
  return account?.Profile?.Holders?.Holder?.[0];
}

export function toKyc(account: AaAccount | undefined, now = new Date()): KycProfile | undefined {
  const holder = firstHolder(account);
  if (!holder) return undefined;
  const { city, state, pincode } = splitAddress(holder.address);
  return {
    name: spaceName(holder.name),
    dob: isoDay(holder.dob),
    age: ageFrom(holder.dob, now),
    maskedPan: maskPan(holder.pan),
    mobile: holder.mobile ?? "",
    email: holder.email ?? "",
    address: holder.address ?? "",
    city,
    state,
    pincode,
    nomineeRegistered: (holder.nominee || "").toUpperCase() === "REGISTERED",
    ckycCompliant:
      (holder.ckycRegistered || "").toUpperCase() === "YES" ||
      (holder.ckycCompliance || "").toLowerCase() === "true",
    maskedAccountNumber: account?.maskedAccountNumber ?? "",
    ifsc: account?.Summary?.ifsc ?? account?.Summary?.ifscCode ?? "",
    branch: account?.Summary?.branch ?? "",
    accountOpenDate: isoDay(account?.Summary?.openingDate),
  };
}

/** Whole years, counting only birthdays that have actually happened. */
export function ageFrom(dob: string, now = new Date()): number {
  const born = new Date(isoDay(dob));
  if (Number.isNaN(born.getTime())) return 0;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const month = now.getUTCMonth() - born.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < born.getUTCDate())) age--;
  return age > 0 && age < 130 ? age : 0;
}

/**
 * "142, Lake View, Near City Mall, PUNE, MH, 411001" → city PUNE, state MH,
 * pincode 411001. Indian addresses end city, state, pincode; anything that does
 * not fit returns blanks rather than a wrong guess.
 */
export function splitAddress(address: string | undefined): {
  city: string;
  state: string;
  pincode: string;
} {
  const parts = (address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts.at(-1) ?? "";
  const pincode = /^\d{6}$/.test(last) ? last : "";
  const tail = pincode ? parts.slice(0, -1) : parts;
  return {
    city: titleCase(tail.at(-2) ?? ""),
    state: (tail.at(-1) ?? "").toUpperCase(),
    pincode,
  };
}

/**
 * The AA returns the holder name as one unspaced run ("PRIYAPATIL"). There is
 * no safe way to split that — "PRIYAPATIL" could be Priya Patil or Priyap Atil
 * — so we only case it. Core banking's API 365 returns firstName/lastName
 * separately, so prefer that when both are available; see `displayName`.
 */
export function spaceName(name: string | undefined): string {
  const raw = (name ?? "").trim();
  return raw ? titleCase(raw) : "";
}

/** Present a name for reading: structured beats unspaced, and neither shouts. */
export function displayName(structured: string | undefined, aaName?: string): string {
  const s = (structured ?? "").trim();
  if (/\s/.test(s)) return titleCase(s);
  return spaceName(aaName) || titleCase(s);
}

export function maskPan(pan: string | undefined): string {
  const raw = (pan ?? "").trim().toUpperCase();
  if (raw.length !== 10) return raw ? "••••••••••" : "";
  return `${raw.slice(0, 2)}${"•".repeat(5)}${raw.slice(-3)}`;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .trim();
}

// ---- Transactions ----

/** 739 and 595 disagree on the timestamp field name. Read whichever is present. */
export function txnDate(t: AaTransaction): string {
  return isoDay(
    t.transactionTimestamp ?? t.transactionTimeStamp ?? t.transactionDateTime ?? t.valueDate,
  );
}

/**
 * Map an AA transaction into the domain. The narration is a real description
 * ("Salary Credit"), so it becomes the category directly — far better than the
 * core-banking statement's "S1 TXN 1".
 */
export function toTransaction(t: AaTransaction): Transaction {
  const value = Math.abs(Number(t.amount) || 0);
  const isDebit = (t.type || "").toUpperCase().startsWith("D");
  return {
    date: txnDate(t),
    category: (t.narration || t.mode || "Other").trim(),
    amount: isDebit ? -value : value,
  };
}

export function transactionsOf(accounts: AaAccount[]): Transaction[] {
  return accounts
    .flatMap((a) => a.Transactions?.Transaction ?? [])
    .map(toTransaction)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Current balance across the AA-linked deposit accounts. */
export function balanceOf(accounts: AaAccount[]): number {
  return accounts.reduce(
    (s, a) => s + amt({ amountValue: a.Summary?.currentBalance ?? "0", currencyCode: "INR" }),
    0,
  );
}

/** Payment-rail mix — a behavioural signal core banking does not expose. */
export function modeBreakdown(accounts: AaAccount[]): { mode: string; count: number }[] {
  const byMode = new Map<string, number>();
  for (const a of accounts) {
    for (const t of a.Transactions?.Transaction ?? []) {
      const mode = (t.mode || "OTHERS").toUpperCase();
      byMode.set(mode, (byMode.get(mode) ?? 0) + 1);
    }
  }
  return [...byMode.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);
}

export type { AaAccount, AaStatementResponse };
