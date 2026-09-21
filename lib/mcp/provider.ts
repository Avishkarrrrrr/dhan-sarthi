import type { AgentId } from "@/lib/contracts/types";

/**
 * External tools for agents, behind one interface.
 *
 * No specialist ever holds a vendor's client. The markets desk receives a
 * `ToolProvider` and asks it for a tool by name; whether that is Tapetide, a
 * different research service, or nothing at all is a configuration decision
 * made somewhere else. That indirection is what makes the whole feature
 * *optional* rather than load-bearing — and it has to be optional, because in
 * IDBI's VPC our declared egress is two domains and Tapetide is not one of
 * them.
 *
 * Every rule below is enforced in code rather than by convention, because
 * "we promised not to" is not a security control.
 */

export interface ToolCall {
  server: string;
  tool: string;
  args: string;
  at: string;
}

export interface ToolResult {
  /** Text the agent may reason about — already treated as untrusted. */
  text: string;
  call: ToolCall;
}

export interface ToolProvider {
  name: string;
  enabled: boolean;
  listTools(): Promise<string[]>;
  call(agent: AgentId, tool: string, args: Record<string, unknown>): Promise<ToolResult | undefined>;
  /** Everything this provider was asked for, for the audit trail. */
  calls(): ToolCall[];
}

/**
 * The provider used when there is no provider.
 *
 * Returning undefined rather than throwing is the point: an agent must behave
 * identically whether or not external research is available, so the
 * no-provider path is the *normal* path and the enabled one is the extra.
 */
export class NullToolProvider implements ToolProvider {
  name = "none";
  enabled = false;
  async listTools(): Promise<string[]> {
    return [];
  }
  async call(): Promise<undefined> {
    return undefined;
  }
  calls(): ToolCall[] {
    return [];
  }
}

/**
 * Which agent may call which tools. The compliance layer appears nowhere: a
 * suitability decision must be reproducible from the customer's own data, and
 * a rule that can consult the internet is a rule whose verdict changes
 * depending on when you ask it.
 */
export const TOOL_ALLOWLIST: Partial<Record<AgentId, string[]>> = {
  markets: ["get_stock_fundamentals", "get_technical_indicators", "get_fii_dii_flows"],
  macro: ["get_fii_dii_flows"],
};

export function mayCall(agent: AgentId, tool: string): boolean {
  return (TOOL_ALLOWLIST[agent] ?? []).includes(tool);
}

/**
 * Nothing but instrument identifiers may leave the VPC.
 *
 * We told IDBI in writing that a customer's holdings, transactions and goals
 * are never transmitted outside it. This is that promise, as a function: an
 * allow-list of argument shapes rather than a deny-list of bad ones, because
 * a deny-list is a guess about what PII looks like and this has to be right
 * every time. Anything not recognised is refused.
 */
const SAFE_ARG = /^[A-Z0-9.&:_-]{1,24}$/i;
const SAFE_KEYS = new Set(["symbol", "symbols", "ticker", "tickers", "exchange", "period", "limit"]);

export function argsAreSafe(args: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(args)) {
    if (!SAFE_KEYS.has(key)) return false;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (typeof v === "number") continue;
      if (typeof v !== "string" || !SAFE_ARG.test(v)) return false;
    }
  }
  return true;
}
