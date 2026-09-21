/**
 * Regenerate the contract fixtures from a real run of the system, so they can
 * never describe a shape the code does not actually produce.
 */
import { writeFileSync } from "node:fs";
import { getCustomer } from "@/lib/data/customers";
import { aggregate } from "@/lib/aggregate";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { runCommittee } from "@/lib/agents/committee";
import { syntheticSnapshot } from "@/lib/market/nifty";
import { startSession, advance } from "@/lib/discovery/machine";
import * as queue from "@/lib/hitl/queue";
import { raiseRetentionAlert } from "@/lib/hitl/retention";
import type { CommitteeEvent } from "@/lib/contracts/types";

const DIR = "lib/contracts/fixtures";
const write = (name: string, value: unknown) => {
  writeFileSync(`${DIR}/${name}`, JSON.stringify(value, null, 2) + "\n");
  console.log("wrote", name);
};

(async () => {
  const customer = getCustomer("rajesh")!;
  const snapshot = buildSnapshot(customer);

  write("aggregation.sample.json", aggregate(customer, false));

  // A whole voice interview, turn by turn.
  let state = startSession(customer.id, "en-IN");
  const answers = [
    "a car and an emergency fund",
    "retirement and my daughter's education",
    "15 years",
    "2 crore",
    "50 thousand a month",
    "10 percent",
    "I would wait it out",
    "6 months",
    "yes that's right",
  ];
  let ips;
  for (const a of answers) {
    const r = advance(state, a, snapshot);
    state = r.state;
    if (r.ips) ips = r.ips;
  }
  write("discovery.turns.sample.json", state.turns);
  write("ips.sample.json", ips);

  // The committee, end to end.
  const events: CommitteeEvent[] = [];
  for await (const e of runCommittee({ snapshot, market: syntheticSnapshot() })) events.push(e);
  write("committee.stream.sample.json", events);
  write(
    "views.sample.json",
    events.filter((e) => e.type === "agent_view").map((e) => (e as { view: unknown }).view),
  );

  const ticket = queue.list().find((t) => t.kind === "advice_approval");
  if (ticket) write("ticket.sample.json", ticket);

  queue.reset();
  const retention = raiseRetentionAlert(snapshot);
  if (retention) write("ticket.retention.sample.json", retention);
})();
