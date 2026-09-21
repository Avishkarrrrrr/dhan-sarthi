import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore, dataDir } from "@/lib/store/jsonStore";

describe("JsonStore", () => {
  let dir: string;
  const saved = process.env.DHAN_DATA_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dhan-store-"));
    process.env.DHAN_DATA_DIR = dir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DHAN_DATA_DIR;
    else process.env.DHAN_DATA_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("survives a restart", () => {
    const first = new JsonStore<{ id: string }>("things");
    first.prepend({ id: "a" });
    first.prepend({ id: "b" });
    first.persist();

    // A new instance is what a restarted process actually gets.
    const second = new JsonStore<{ id: string }>("things");
    expect(second.all().map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("keeps newest first and caps growth", () => {
    const s = new JsonStore<{ n: number }>("capped", { max: 3 });
    for (let n = 0; n < 6; n++) s.prepend({ n });
    expect(s.all().map((x) => x.n)).toEqual([5, 4, 3]);
  });

  it("persists an in-place edit when told to", () => {
    const s = new JsonStore<{ id: string; status: string }>("edits");
    s.prepend({ id: "t1", status: "pending" });
    s.all()[0].status = "approved";
    s.touch();
    s.persist();
    expect(new JsonStore<{ status: string }>("edits").all()[0].status).toBe("approved");
  });

  it("starts empty rather than throwing on a corrupt file", () => {
    // Losing history is bad; refusing to start is worse.
    writeFileSync(join(dir, "broken.json"), "{ this is not json");
    expect(new JsonStore("broken").all()).toEqual([]);
  });

  it("writes through a temp file so a crash cannot truncate the real one", () => {
    const s = new JsonStore<{ id: string }>("atomic");
    s.prepend({ id: "x" });
    s.persist();
    expect(existsSync(join(dir, "atomic.json"))).toBe(true);
    expect(existsSync(join(dir, "atomic.json.tmp"))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "atomic.json"), "utf8"))).toEqual([{ id: "x" }]);
  });

  it("defaults outside the app directory, which deploys replace", () => {
    delete process.env.DHAN_DATA_DIR;
    // A file under ~/app would look durable, survive restarts, and vanish on
    // the next deploy — discovered only when the history mattered.
    expect(dataDir()).not.toMatch(/[/\\]app([/\\]|$)/);
  });
});
