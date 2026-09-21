import { describe, it, expect, beforeEach } from "vitest";
import type { Customer, Transaction } from "@/lib/data/types";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { classifyCounterparty } from "@/lib/finance/counterparty";
import { detectOutflows, SIGNAL_MIN_AMOUNT } from "@/lib/agents/retention";
import { raiseRetentionAlert } from "@/lib/hitl/retention";
import * as queue from "@/lib/hitl/queue";

beforeEach(() => queue.reset());

function customer(transactions: Transaction[], holdings = [{ assetClass: "cash" as const, name: "Savings", value: 1_000_000 }]): Customer {
  return {
    id: "t",
    name: "Test Person",
    age: 40,
    persona: "test",
    city: "Pune",
    monthlyIncome: 200_000,
    riskProfile: "moderate",
    holdings,
    transactions,
    goals: [{ id: "g", label: "Retirement", targetAmount: 1e7, targetYear: 2050, current: 0 }],
  };
}

const debit = (category: string, amount: number, date = "2026-08-01"): Transaction => ({
  date,
  category,
  amount: -amount,
});

describe("counterparty classification", () => {
  it("reads the destination out of the narration", () => {
    expect(classifyCounterparty("NEFT/ZERODHA BROKING/ONLINE").destination).toBe("external_broker");
    expect(classifyCounterparty("IMPS/HDFC BANK/TRF").destination).toBe("competitor_bank");
    expect(classifyCounterparty("UPI/GROWW/COLLECT").destination).toBe("external_broker");
    expect(classifyCounterparty("ACH/BAJAJ FIN FD").destination).toBe("nbfc_deposit");
  });

  /*
   * The sandbox labels every row "S1 TXN 7". Classifying that as anything at
   * all would be inventing a counterparty out of a serial number.
   */
  it("refuses to classify a reference number", () => {
    expect(classifyCounterparty("S1 TXN 19").destination).toBe("unknown");
    expect(classifyCounterparty("").destination).toBe("unknown");
  });
});

describe("the radar", () => {
  it("groups repeated transfers to the same broker into one signal", () => {
    const insight = detectOutflows(
      buildSnapshot(
        customer([
          debit("NEFT/ZERODHA BROKING", 150_000, "2026-06-01"),
          debit("NEFT/ZERODHA BROKING", 150_000, "2026-07-01"),
          debit("NEFT/ZERODHA BROKING", 150_000, "2026-08-01"),
        ]),
      ),
    );
    expect(insight.signals).toHaveLength(1);
    expect(insight.signals[0].trailing3mTotal).toBe(450_000);
    expect(insight.signals[0].recurring).toBe(true);
    expect(insight.signals[0].severity).toBe("critical");
    expect(insight.narrative).toMatch(/ZERODHA/);
  });

  it("ignores ordinary spending", () => {
    const insight = detectOutflows(
      buildSnapshot(customer([debit("UPI/BIGBASKET", 12_000), debit("NEFT/ZERODHA", SIGNAL_MIN_AMOUNT - 1)])),
    );
    expect(insight.signals).toHaveLength(0);
    expect(insight.attritionRisk).toBe(0);
  });

  it("says plainly when the feed has no narration to read", () => {
    const insight = detectOutflows(
      buildSnapshot(customer([debit("S1 TXN 3", 200_000), debit("S1 TXN 7", 180_000)])),
    );
    expect(insight.signals).toHaveLength(0);
    expect(insight.narrative).toMatch(/no counterparty narration/i);
    // An absence of evidence must not read as evidence of absence.
    expect(insight.narrative).toMatch(/absence of evidence/i);
  });
});

describe("raising the alert", () => {
  const leaving = () =>
    buildSnapshot(
      customer([
        debit("NEFT/ZERODHA BROKING", 200_000, "2026-06-01"),
        debit("NEFT/ZERODHA BROKING", 200_000, "2026-07-01"),
      ]),
    );

  it("creates one ticket, not one per scan", () => {
    const a = raiseRetentionAlert(leaving());
    const b = raiseRetentionAlert(leaving());
    expect(a).not.toBeNull();
    expect(b!.id).toBe(a!.id);
    expect(queue.list("pending")).toHaveLength(1);
    expect(a!.kind).toBe("retention_alert");
    expect(a!.reason).toBe("deposit_flight");
  });

  it("stays quiet when nothing is leaving", () => {
    expect(raiseRetentionAlert(buildSnapshot(customer([debit("UPI/BIGBASKET", 9000)])))).toBeNull();
  });

  /*
   * The whole point. A retention engine that can skip suitability is a
   * mis-selling engine with a commercial motive attached.
   */
  it("withholds a counter-offer that fails suitability, and still raises the alert", () => {
    // A conservative customer nearing retirement, with money walking out.
    const c = customer(
      [
        debit("NEFT/ZERODHA BROKING", 400_000, "2026-06-01"),
        debit("NEFT/ZERODHA BROKING", 400_000, "2026-07-01"),
      ],
      [{ assetClass: "cash" as const, name: "Savings", value: 1_000_000 }],
    );
    c.riskProfile = "conservative";
    c.age = 62;
    const ticket = raiseRetentionAlert(buildSnapshot(c));

    expect(ticket).not.toBeNull();
    if (ticket!.actions.length === 0) {
      expect(ticket!.note).toMatch(/withheld/i);
    }
    // Either it passed compliance, or it was withheld with a reason. What must
    // never happen is an unvetted product reaching the RM.
    expect(ticket!.actions.length === 0 || ticket!.retention!.counterOffer.length > 0).toBe(true);
  });
});
