import type {
  AggregationResult,
  Customer,
  SourceKind,
  SourceStatus,
} from "@/lib/contracts/types";
import { buildSnapshot } from "@/lib/contracts/snapshot";
import { toPositions } from "./positions";

/**
 * Stage 1: the 360° picture, and an honest account of how much of it we have.
 *
 * The interesting output is not the snapshot — it is `completeness`. IDBI's
 * APIs cover a customer's bank accounts, deposits and spending, and nothing
 * else: there is no holdings API in the sandbox, verified across all 25. So
 * the bank can supply half the picture and the customer supplies the rest,
 * and a screen that quietly showed a half-picture as though it were whole
 * would be the most consequential lie in the product — every allocation, every
 * suitability check and every tax number downstream is computed against it.
 *
 * Saying "3 of 6 sources linked" is also the strongest argument for the
 * portfolio import sitting right beside it.
 */

const KINDS: SourceKind[] = ["bank", "deposits", "spending", "equity", "mf", "bonds", "gold"];

/** What a customer would recognise each source as. */
const LABELS: Record<SourceKind, string> = {
  bank: "Savings & current accounts",
  deposits: "Fixed & recurring deposits",
  spending: "Income & spending",
  equity: "Stocks",
  mf: "Mutual funds",
  bonds: "Bonds & small savings",
  gold: "Gold",
};

export function sourceLabel(kind: SourceKind): string {
  return LABELS[kind];
}

/**
 * Which holdings answer for which source. `spending` is the transaction feed
 * rather than a holding, and `bank` and `deposits` split what the bank returns
 * as one balance block, because a customer thinks of them as two things.
 */
function countFor(kind: SourceKind, c: Customer): number {
  const holdings = c.holdings ?? [];
  switch (kind) {
    case "bank":
      return holdings.filter((h) => h.assetClass === "cash").length;
    case "deposits":
      return holdings.filter((h) => h.assetClass === "fd").length;
    case "spending":
      return (c.transactions ?? []).length;
    case "equity":
      return holdings.filter((h) => h.assetClass === "equity").length;
    case "mf":
      return holdings.filter((h) => h.assetClass === "mutual_fund").length;
    case "bonds":
      return holdings.filter((h) => h.assetClass === "bonds").length;
    case "gold":
      return holdings.filter((h) => h.assetClass === "gold").length;
  }
}

/** Who supplied it — the bank for the first three, the customer for the rest. */
const PROVIDERS: Record<SourceKind, string> = {
  bank: "IDBI 394 · 365",
  deposits: "IDBI 365 · 362",
  spending: "IDBI 393",
  equity: "Added by you",
  mf: "Added by you",
  bonds: "Added by you",
  gold: "Added by you",
};

/**
 * The bank cannot supply these, so an empty one is *skipped*, not *failed*.
 * The distinction matters: failed invites someone to retry something that was
 * never going to work, and hides the real answer, which is that the data has
 * to come from the customer.
 */
const CUSTOMER_SUPPLIED: SourceKind[] = ["equity", "mf", "bonds", "gold"];

export function aggregate(customer: Customer, live: boolean, now = new Date()): AggregationResult {
  const at = now.toISOString();

  /*
   * A live *source* is not the same as live *data*. The IDBI source falls back
   * to a bundled persona when the gateway is unreachable — an IP allow-list
   * change is enough to do it — and the screen must not go on crediting the
   * bank for numbers a fixture produced.
   */
  const fromBank = live && customer.dataSource !== "fallback";

  const sources: SourceStatus[] = KINDS.map((kind) => {
    const itemCount = countFor(kind, customer);
    const customerSupplied = CUSTOMER_SUPPLIED.includes(kind);

    if (itemCount > 0) {
      return {
        kind,
        provider: customerSupplied ? PROVIDERS[kind] : fromBank ? PROVIDERS[kind] : "Demo data",
        status: "linked",
        itemCount,
        lastSyncedAt: at,
      };
    }

    return {
      kind,
      provider: PROVIDERS[kind],
      status: customerSupplied ? "skipped" : "pending",
      itemCount: 0,
      note: customerSupplied
        ? "IDBI's APIs carry no holdings data — add these yourself and the whole picture completes."
        : "Nothing returned for this account.",
    };
  });

  const linked = sources.filter((s) => s.status === "linked");
  return {
    snapshot: buildSnapshot(customer, now),
    positions: toPositions(customer),
    sources,
    completeness: Math.round((linked.length / KINDS.length) * 100) / 100,
    missing: sources.filter((s) => s.status !== "linked").map((s) => s.kind),
  };
}
