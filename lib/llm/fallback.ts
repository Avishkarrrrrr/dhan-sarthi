import type { ChatMsg, LlmProvider } from "./provider";

/**
 * Deterministic, on-persona responses used when no LLM key is configured or a
 * live call fails. Intent is inferred from keywords. The customer's first name
 * is pulled from the system prompt so replies stay personal. This is a safety
 * net so the public demo never hard-fails — not the primary product.
 */
export class FallbackProvider implements LlmProvider {
  name = "fallback" as const;

  async complete(messages: ChatMsg[], system: string): Promise<string> {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const q = last.toLowerCase();
    const name = /Name:\s*([^,]+),/.exec(system)?.[1]?.trim().split(" ")[0] ?? "there";
    const equity = /Equity\+MF exposure:\s*([\d.]+)%/.exec(system)?.[1] ?? "your current";
    const nw = /Net worth:\s*(₹[\d,]+)/.exec(system)?.[1] ?? "your portfolio";

    if (/\b(hi|hello|hey|namaste|start)\b/.test(q) || !q) {
      return `Namaste ${name}! I'm Dhan Sarthi, your personal wealth guide. I can review your portfolio, check if you're on track for your goals, or show where your money is going. What would you like to look at first?`;
    }
    if (/(allocat|portfolio|invest|rebalanc|equity|stock|mutual)/.test(q)) {
      return `${name}, your net worth is around ${nw}, with roughly ${equity}% in equity and mutual funds. That's a reasonable growth base — I'd keep 6 months of expenses safe in liquid funds first, then continue your SIPs. Want me to suggest a rebalancing split?`;
    }
    if (/(retire|goal|track|target|future|corpus)/.test(q)) {
      return `Great question, ${name}. Based on your current savings and contributions, you're building steadily toward your goals. If we increase your monthly SIP a little, you could close the gap faster. Shall I run a quick projection for your top goal?`;
    }
    if (/(spend|money going|budget|save|expense)/.test(q)) {
      return `Looking at your last few months, ${name}, your biggest outflows are rent, investments and dining. Trimming even 10-15% from discretionary spends and redirecting it into your SIP compounds nicely over time. Want the exact numbers?`;
    }
    if (/(tax|80c|elss|save tax)/.test(q)) {
      return `For tax savings, ${name}, options like ELSS funds, PPF and NPS fall under Section 80C. ELSS also keeps your money growth-oriented. For your specific filing, it's best to confirm with a SEBI-registered advisor or your RM — I can explain how each option works if you'd like.`;
    }
    return `I hear you, ${name}. I'm here to help with your investments, savings, budgeting and financial goals. Could you tell me a little more about what you'd like to plan — for example your portfolio, a goal like retirement, or your monthly spending?`;
  }
}
