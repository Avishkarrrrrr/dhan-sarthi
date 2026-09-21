import { randomUUID } from "node:crypto";
import type { AuditEntry } from "@/lib/contracts/types";
import { JsonStore } from "@/lib/store/jsonStore";

/**
 * Append-only audit trail. Every piece of advice the system emits is recorded
 * with the views that produced it, the allocation, the compliance verdict and
 * what was actually said — so any recommendation can be reconstructed months
 * later. That traceability is the difference between an AI a bank can deploy
 * and one it cannot.
 *
 * Durable, because it has to be: this used to be an array in memory, so a
 * service restart erased every recommendation the system had ever made. A
 * compliance record that a process recycle can delete is not a record.
 */

const MAX_ENTRIES = 500;
const store = new JsonStore<AuditEntry>("audit", { max: MAX_ENTRIES });

export function newAuditId(): string {
  return `AUD-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function append(entry: Omit<AuditEntry, "auditId" | "timestamp"> & Partial<Pick<AuditEntry, "auditId" | "timestamp">>): AuditEntry {
  const full: AuditEntry = {
    auditId: entry.auditId ?? newAuditId(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    customerId: entry.customerId,
    views: entry.views,
    allocation: entry.allocation,
    actions: entry.actions,
    verdict: entry.verdict,
    hitl: entry.hitl,
    tax: entry.tax,
    finalSpokenText: entry.finalSpokenText,
  };
  return store.prepend(full);
}

/**
 * Record the customer's own decision on their Action Card.
 *
 * It lands on the same entry as the RM's signature deliberately. The customer
 * consents to their money; the bank signs for its advice. Those two facts are
 * only worth anything together — split across two logs, neither proves the
 * chain held. Returns undefined for an unknown entry.
 */
export function recordCustomerDecision(
  auditId: string,
  decision: "approved" | "declined",
): AuditEntry | undefined {
  const entry = get(auditId);
  if (!entry) return undefined;
  entry.customerDecision = decision;
  entry.customerDecidedAt = new Date().toISOString();
  // The entry is a live reference into the store; this is what persists it.
  store.touch();
  return entry;
}

export function get(auditId: string): AuditEntry | undefined {
  return store.all().find((e) => e.auditId === auditId);
}

/** Most recent first. */
export function list(limit = 50): AuditEntry[] {
  return store.all().slice(0, limit);
}

/** Test seam. */
export function reset(): void {
  store.reset();
}
