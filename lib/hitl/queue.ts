import { randomUUID } from "node:crypto";
import type { EscalationTicket } from "@/lib/contracts/types";

/**
 * The RM escalation queue. In-memory for the prototype — swap for a table when
 * it needs to survive a restart; nothing else changes.
 */

const tickets: EscalationTicket[] = [];

export function create(
  input: Omit<EscalationTicket, "id" | "createdAt" | "status">,
): EscalationTicket {
  const ticket: EscalationTicket = {
    ...input,
    id: `ESC-${randomUUID().slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  tickets.unshift(ticket);
  return ticket;
}

export function list(status?: EscalationTicket["status"]): EscalationTicket[] {
  return status ? tickets.filter((t) => t.status === status) : [...tickets];
}

export function get(id: string): EscalationTicket | undefined {
  return tickets.find((t) => t.id === id);
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
  return ticket;
}

/** Test seam. */
export function reset(): void {
  tickets.length = 0;
}
