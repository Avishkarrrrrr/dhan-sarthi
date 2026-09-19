import { randomUUID } from "node:crypto";
import type { AuditEntry } from "@/lib/contracts/types";

/**
 * Append-only audit trail. Every piece of advice the system emits is recorded
 * with the views that produced it, the allocation, the compliance verdict and
 * what was actually said — so any recommendation can be reconstructed months
 * later. That traceability is the difference between an AI a bank can deploy
 * and one it cannot.
 *
 * In-memory for the prototype; the shape maps 1:1 onto a table, and
 * `lib/data/postgres.ts` already has the pool when we want to persist it.
 */

const MAX_ENTRIES = 500;
const entries: AuditEntry[] = [];

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
    verdict: entry.verdict,
    hitl: entry.hitl,
    finalSpokenText: entry.finalSpokenText,
  };
  entries.unshift(full);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return full;
}

export function get(auditId: string): AuditEntry | undefined {
  return entries.find((e) => e.auditId === auditId);
}

/** Most recent first. */
export function list(limit = 50): AuditEntry[] {
  return entries.slice(0, limit);
}

/** Test seam. */
export function reset(): void {
  entries.length = 0;
}
