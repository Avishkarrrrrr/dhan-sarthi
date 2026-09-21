import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A small durable store for records that must survive a restart.
 *
 * The audit trail and the RM queue were in-memory, so restarting the service
 * erased every recommendation the system had made and every escalation waiting
 * on a human. For a compliance trail that is not a rough edge — a record that
 * disappears when a process recycles is not a record.
 *
 * Deliberately a file rather than Postgres: no RDS is configured in the
 * sandbox, and an audit log that depends on a database nobody provisioned is
 * less durable than one that depends on a disk.
 */

/**
 * Where the data lives.
 *
 * Outside the application directory on purpose. Deploys replace `~/app`
 * wholesale, so a file written inside it would look durable, survive restarts,
 * and then vanish on the next deploy — the worst of both, because it would
 * only be discovered when the history mattered.
 */
export function dataDir(): string {
  return process.env.DHAN_DATA_DIR || join(homedir(), "dhan-sarthi-data");
}

export interface StoreOptions {
  /** Newest-first cap. Older records fall off rather than growing unbounded. */
  max?: number;
}

export class JsonStore<T> {
  private items: T[] | null = null;
  private readonly file: string;
  private readonly max: number;
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, opts: StoreOptions = {}) {
    this.file = join(dataDir(), `${name}.json`);
    this.max = opts.max ?? 500;
  }

  /** Read-through: the file is loaded once, then kept in memory. */
  all(): T[] {
    if (this.items) return this.items;
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, "utf8"));
        this.items = Array.isArray(parsed) ? (parsed as T[]) : [];
      } else {
        this.items = [];
      }
    } catch {
      // A corrupt or unreadable file must not take the app down. Starting
      // empty loses history; refusing to start loses the demo.
      this.items = [];
    }
    return this.items;
  }

  /** Newest first. */
  prepend(item: T): T {
    const items = this.all();
    items.unshift(item);
    if (items.length > this.max) items.length = this.max;
    this.schedulePersist();
    return item;
  }

  /** Mutate in place — the caller already holds a reference from `all()`. */
  touch(): void {
    this.schedulePersist();
  }

  reset(): void {
    this.items = [];
    this.schedulePersist();
  }

  /**
   * Coalesce writes. A committee run appends an audit entry and a ticket
   * within milliseconds of each other; writing the whole file per append
   * would be three syscalls for one logical event.
   */
  private schedulePersist(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.persist();
    }, 50);
    // Never hold the process open for a pending flush.
    this.pending.unref?.();
  }

  /**
   * Write to a temporary file and rename over the target.
   *
   * A rename is atomic on the same filesystem, so a crash mid-write leaves the
   * previous good file rather than a half-written one. Writing in place would
   * mean the one moment the audit trail is needed — after an unclean stop — is
   * the moment it is most likely to be truncated.
   */
  persist(): void {
    try {
      const dir = dataDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.items ?? [], null, 0), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      // Losing durability is bad; taking the request down with it is worse.
      console.error(`JsonStore: could not persist ${this.file}:`, err);
    }
  }
}
