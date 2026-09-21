import { randomUUID } from "node:crypto";
import type { EscalationTicket } from "@/lib/contracts/types";
import { JsonStore } from "@/lib/store/jsonStore";

/**
 * The RM escalation queue.
 *
 * Durable: an escalation is a customer waiting on a human decision, and a
 * restart used to drop the whole queue silently. Nobody would know what had
 * been lost, which is the worst property a work queue can have.
 */

const store = new JsonStore<EscalationTicket>("hitl-queue", { max: 300 });

export function create(
  input: Omit<EscalationTicket, "id" | "createdAt" | "status">,
): EscalationTicket {
  const ticket: EscalationTicket = {
    ...input,
    id: `ESC-${randomUUID().slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  return store.prepend(ticket);
}

export function list(status?: EscalationTicket["status"]): EscalationTicket[] {
  const all = store.all();
  return status ? all.filter((t) => t.status === status) : [...all];
}

export function get(id: string): EscalationTicket | undefined {
  return store.all().find((t) => t.id === id);
}

/** Record the RM's decision. Returns undefined for an unknown ticket. */
export function decide(
  id: string,
  decision: "approved" | "modified" | "rejected",
  modified?: EscalationTicket["proposed"],
): EscalationTicket | undefined {
  const ticket = get(id);
  if (!ticket) return undefined;
  ticket.status = decision;
  if (decision === "modified" && modified) ticket.proposed = modified;
  // The ticket is a live reference into the store, so the change is already
  // in memory — this is what gets it onto disk.
  store.touch();
  return ticket;
}

/** Test seam. */
export function reset(): void {
  store.reset();
}
