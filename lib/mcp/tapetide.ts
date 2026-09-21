import type { AgentId } from "@/lib/contracts/types";
import { checkText, redactText } from "@/lib/compliance/guardrails";
import { argsAreSafe, mayCall, type ToolCall, type ToolProvider, type ToolResult } from "./provider";

/**
 * Tapetide's MCP server — Indian equity research: fundamentals, technicals,
 * FII/DII flows.
 *
 * Spoken to over plain JSON-RPC rather than through an SDK. The protocol is
 * two calls wide for our purposes, and a dependency that only earns its place
 * when a token exists is a dependency that mostly costs us build size.
 *
 * ## The two rules that are not negotiable
 *
 * **Nothing about the customer goes out.** Arguments are checked against an
 * allow-list of instrument-identifier shapes before the request is made; the
 * request does not happen if they fail. Symbols leave. Names, balances,
 * holdings, goals and the IPS do not.
 *
 * **Nothing that comes back is an instruction.** A tool response is a
 * prompt-injection surface — a compromised or hostile field can carry text
 * telling an agent what to do — so every response passes through the same
 * guardrails we run on user input, and anything that reads like an
 * instruction or a prohibited claim is dropped rather than handed to a model.
 */

const DEFAULT_ENDPOINT = "https://tapetide.com/mcp";

export class TapetideProvider implements ToolProvider {
  name = "tapetide";
  enabled: boolean;
  private endpoint: string;
  private token: string;
  private log: ToolCall[] = [];

  constructor(token = process.env.TAPETIDE_TOKEN ?? "", endpoint = process.env.TAPETIDE_MCP_URL ?? DEFAULT_ENDPOINT) {
    this.token = token;
    this.endpoint = endpoint;
    this.enabled = Boolean(token);
  }

  calls(): ToolCall[] {
    return [...this.log];
  }

  async listTools(): Promise<string[]> {
    if (!this.enabled) return [];
    const res = await this.rpc("tools/list", {});
    const tools = (res as { tools?: { name: string }[] })?.tools ?? [];
    return tools.map((t) => t.name);
  }

  async call(
    agent: AgentId,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult | undefined> {
    if (!this.enabled) return undefined;

    // Fail closed, twice: the agent must be allowed this tool, and the
    // arguments must contain nothing but instrument identifiers.
    if (!mayCall(agent, tool)) return undefined;
    if (!argsAreSafe(args)) return undefined;

    const call: ToolCall = {
      server: this.name,
      tool,
      args: JSON.stringify(args),
      at: new Date().toISOString(),
    };

    try {
      const res = await this.rpc("tools/call", { name: tool, arguments: args });
      const content = (res as { content?: { type: string; text?: string }[] })?.content ?? [];
      const raw = content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text as string)
        .join("\n")
        .slice(0, 4000);

      const text = sanitise(raw);
      if (!text) return undefined;

      this.log.push(call);
      return { text, call };
    } catch {
      // A research service being down must never be the reason advice fails.
      return undefined;
    }
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`mcp ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(String(json.error?.message ?? "mcp error"));
    return json.result;
  }
}

/**
 * Treat a tool response as data.
 *
 * Instruction-shaped text is stripped entirely rather than escaped: there is
 * no legitimate reason for a fundamentals lookup to contain "ignore previous
 * instructions", so its presence is itself the signal. What survives also goes
 * through the output guard, so a third party cannot put "guaranteed returns"
 * into the mouth of the advisor.
 */
export function sanitise(raw: string): string {
  if (!raw.trim()) return "";

  const INJECTION =
    /(ignore (all )?(previous|prior|above)|disregard (the )?(previous|system)|you are now|new instructions?:|system prompt|<\/?(system|instructions?)>)/i;
  if (INJECTION.test(raw)) return "";

  const cleaned = redactText(raw);
  // If the output guard objects to it, an agent should not be reasoning with
  // it either.
  return checkText(cleaned).length ? "" : cleaned;
}
