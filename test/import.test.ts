import { describe, it, expect } from "vitest";
import { INSTRUMENTS, findInstrument, searchInstruments } from "@/lib/import/symbols";
import { classify } from "@/lib/finance/xray";

describe("instrument search", () => {
  it("prefers an exact symbol, then a prefix, then a substring", () => {
    expect(searchInstruments("TCS")[0].symbol).toBe("TCS");
    expect(searchInstruments("infos")[0].name).toBe("Infosys");
    expect(searchInstruments("nifty")[0].name).toContain("Nifty");
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(searchInstruments("")).toEqual([]);
    expect(searchInstruments("   ")).toEqual([]);
  });

  it("finds by symbol, case-insensitively", () => {
    expect(findInstrument("hdfcbank")?.name).toBe("HDFC Bank");
    expect(findInstrument("NOPE")).toBeUndefined();
  });
});

/*
 * The point of curating this list: a holding added here must be one the
 * look-through can see through. An instrument the X-ray cannot classify would
 * land in the unclassified bucket and quietly dilute every sector weight.
 */
describe("every offered instrument is one the X-ray can classify", () => {
  const growth = INSTRUMENTS.filter(
    (i) => i.assetClass === "equity" || i.assetClass === "mutual_fund",
  );

  it("covers all of them", () => {
    const unclassified = growth.filter(
      (i) => !classify({ assetClass: i.assetClass, name: i.name, value: 1 }),
    );
    expect(unclassified.map((i) => i.name)).toEqual([]);
  });

  it("classifies a debt fund as holding no equity", () => {
    const liquid = findInstrument("LIQUIDFUND")!;
    const hit = classify({ assetClass: liquid.assetClass, name: liquid.name, value: 1 })!;
    expect(hit.model.equityShare).toBe(0);
  });
});
