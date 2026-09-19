import type { CustomerRepository } from "./repository";
import { SyntheticRepository } from "./synthetic";
import { PostgresRepository } from "./postgres";

/**
 * Choose a repository from env, mirroring lib/llm/select.ts. Explicit
 * DATA_SOURCE wins; otherwise Postgres when DATABASE_URL is set, else the
 * bundled synthetic personas. Constructing a repository is cheap — the
 * connection pool is only created on first query.
 */
export function selectRepository(): CustomerRepository {
  const forced = (process.env.DATA_SOURCE || "").toLowerCase().trim();

  if (forced === "synthetic") return new SyntheticRepository();
  if (forced === "postgres") return new PostgresRepository();

  if (process.env.DATABASE_URL) return new PostgresRepository();
  return new SyntheticRepository();
}
