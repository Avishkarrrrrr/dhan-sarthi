/**
 * Plain-English names for the rules the policy book checks.
 *
 * The verdict used to print the rule key itself — `concentration.flagged`,
 * `liquidity.buffer_below_target` — in monospace, to the customer. That is a
 * database identifier on a consumer screen: it looks like a leak, it reads as
 * an error, and it tells someone who is not an engineer nothing at all.
 *
 * The key is still what the audit trail records and what `/rm` shows the
 * relationship manager, because that is where an exact identifier belongs.
 * This is only how it is named to the person whose money it is.
 */
export const RULE_LABELS: Record<string, string> = {
  "concentration.flagged": "Concentration noted",
  "concentration.gold": "Gold above its hedge band",
  "concentration.look_through_gap": "Holdings we cannot look through",
  "concentration.overlap": "Overlapping funds",
  "concentration.sector": "Sector concentration",
  "concentration.single_class": "Weighted to one asset class",
  "concentration.single_stock": "Large single stock",
  "guardrail.prohibited_language": "Wording adjusted",
  "liquidity.buffer_below_target": "Emergency buffer below target",
  "liquidity.emergency_fund": "Emergency fund short",
  "schema.invalid_metrics": "Figures failed validation",
  "schema.invalid_weight": "Invalid allocation weight",
  "schema.negative_weight": "Negative allocation weight",
  "schema.weights_sum": "Allocation does not total 100%",
  "sebi.risk_understated": "Risk understated",
  "sebi.unrealistic_return": "Return assumption too high",
  "suitability.age": "Age and horizon",
  "suitability.defensive_floor": "Below the defensive floor",
  "suitability.direct_equity_cap": "Direct equity above the cap",
  "suitability.growth_cap": "Growth assets above the cap",
  "suitability.horizon": "Horizon shorter than the plan",
};

/** Falls back to the key made readable, so a new rule is never a raw dotted string. */
export function ruleLabel(rule: string): string {
  const known = RULE_LABELS[rule];
  if (known) return known;
  const tail = rule.split(".").pop() ?? rule;
  const words = tail.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
