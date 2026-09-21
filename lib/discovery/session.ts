import type { DiscoveryState } from "@/lib/contracts/types";
import { JsonStore } from "@/lib/store/jsonStore";

/**
 * Live interview sessions.
 *
 * Durable for the same reason the audit trail is: a customer halfway through
 * answering eight questions should not lose them because the service
 * restarted. Capped, because an abandoned interview has no value after the
 * conversation has moved on.
 */
const store = new JsonStore<DiscoveryState>("discovery", { max: 100 });

export function save(state: DiscoveryState): DiscoveryState {
  const all = store.all();
  const i = all.findIndex((s) => s.sessionId === state.sessionId);
  if (i >= 0) {
    all[i] = state;
    store.touch();
    return state;
  }
  return store.prepend(state);
}

export function get(sessionId: string): DiscoveryState | undefined {
  return store.all().find((s) => s.sessionId === sessionId);
}

/** Test seam. */
export function reset(): void {
  store.reset();
}
