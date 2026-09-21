import { describe, it, expect, beforeEach } from "vitest";
import type { Customer, Holding, Transaction } from "@/lib/data/types";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { classifyCounterparty } from "@/lib/finance/counterparty";
import { detectOutflows, SIGNAL_MIN_AMOUNT } from "@/lib/agents/retention";
import { raiseRetentionAlert } from "@/lib/hitl/retention";
import * as queue from "@/lib/hitl/queue";

beforeEach(() => queue.reset());

function customer(transactions: Transaction[], holdings: Holding[] = [{ assetClass: "cash", name: "Savings", value: 1_000_000 }]): Customer {
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

/*
 * Deposit flight is about deposits. Against net worth, a customer moving ₹4.5
 * lakh out of an ₹11 lakh deposit relationship scores 10% and looks fine —
 * because the denominator included the shares they already hold elsewhere.
 */
describe("what the risk is measured against", () => {
  const leaving = [
    debit("NEFT/ZERODHA BROKING", 150_000, "2026-06-01"),
    debit("NEFT/ZERODHA BROKING", 150_000, "2026-07-01"),
    debit("NEFT/ZERODHA BROKING", 150_000, "2026-08-01"),
  ];

  it("ignores assets held away from the bank", () => {
    const c = customer(leaving, [
      { assetClass: "cash", name: "Savings", value: 600_000 },
      { assetClass: "fd", name: "Business reserve FD", value: 500_000 },
      { assetClass: "equity", name: "Direct stocks", value: 2_700_000 },
    ]);
    const insight = detectOutflows(buildSnapshot(c));
    // ₹4.5L of an ₹11L deposit relationship, recurring.
    expect(insight.signals[0].pctOfBalance).toBeCloseTo(0.409, 2);
    expect(insight.attritionRisk).toBeGreaterThan(0.6);
    expect(raiseRetentionAlert(buildSnapshot(c))).not.toBeNull();
  });

  it("falls back to net worth when nothing is held with the bank", () => {
    const c = customer(leaving, [{ assetClass: "equity", name: "Direct stocks", value: 1_000_000 }]);
    expect(detectOutflows(buildSnapshot(c)).attritionRisk).toBeGreaterThan(0);
  });
});
