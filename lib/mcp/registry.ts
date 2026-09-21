import { NullToolProvider, type ToolProvider } from "./provider";
import { TapetideProvider } from "./tapetide";

/**
 * Choose a tool provider from the environment.
 *
 * Disabled unless `TAPETIDE_TOKEN` is set, and that default is the important
 * one. We told IDBI in writing that the deployment needs exactly two external
 * domains — `api.sarvam.ai` and `query1.finance.yahoo.com`. `tapetide.com` is
 * a third, and adding it quietly to a bank's VPC because a feature happened to
 * be built would be precisely the kind of thing that ends a pilot.
 *
 * So: available in a demo, off in the VPC until a fresh egress request is
 * granted, and the markets desk works either way.
 */
let cached: ToolProvider | undefined;

export function selectToolProvider(): ToolProvider {
  if (cached) return cached;
  cached = process.env.TAPETIDE_TOKEN ? new TapetideProvider() : new NullToolProvider();
  return cached;
}

/** Test seam — the provider is cached for the life of the process. */
export function resetToolProvider(): void {
  cached = undefined;
}

export { NullToolProvider, TapetideProvider };
export type { ToolProvider } from "./provider";
