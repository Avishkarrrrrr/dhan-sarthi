import { describe, it, expect } from "vitest";
import { detectMethod, maskPan, parseCasText } from "@/lib/import/cas";

const NSDL = `
NSDL CONSOLIDATED ACCOUNT STATEMENT
PAN: ABCDE1234F
ISIN Security Name Current Bal Market Price Value
INE009A01021 INFOSYS LIMITED 40 1038.50 41540.00
INE040A01034 HDFC BANK LIMITED 60 739.50 44370.00
INF179K01XQ0 HDFC FLEXI CAP FUND GROWTH 1250.500 78.20 97789.10
`;

describe("reading a CAS", () => {
  it("knows which depository it came from", () => {
    expect(detectMethod(NSDL)).toBe("cas_nsdl");
    expect(detectMethod("CENTRAL DEPOSITORY SERVICES")).toBe("cas_cdsl");
    expect(detectMethod("CAMS statement of account")).toBe("cas_cams");
  });

  /*
   * The ISIN prefix is the one field every depository prints identically, and
   * it says what the instrument is: INE is a company, INF a fund scheme.
   * Names and column orders change between statement versions; ISINs do not.
   */
  it("tells a company from a fund by its ISIN", () => {
    const r = parseCasText(NSDL);
    expect(r.holdings).toHaveLength(3);
    expect(r.holdings[0].kind).toBe("equity");
    // The name stops where the numeric columns start — the first run of this
    // called the holding "INFOSYS LIMITED 40 1038.50 41540.00".
    expect(r.holdings[0].name).toBe("INFOSYS LIMITED");
    expect(r.holdings[1].name).toBe("HDFC BANK LIMITED");
    expect(r.holdings[2].kind).toBe("mf");
    expect(r.holdings[2].schemeName).toBe("HDFC FLEXI CAP FUND GROWTH");
  });

  it("takes the smallest number as units and the largest as value", () => {
    const r = parseCasText(NSDL);
    expect(r.holdings[0].quantity).toBe(40);
    expect(r.holdings[0].value).toBe(41540);
  });

  it("never returns the PAN in full", () => {
    const r = parseCasText(NSDL);
    expect(r.panMasked).toBe("ABCDE****F");
    expect(JSON.stringify(r)).not.toContain("ABCDE1234F");
  });

  it("masks nothing when there is no PAN to mask", () => {
    expect(maskPan("no identifiers here")).toBe("");
  });

  /*
   * A statement gives holdings reliably and purchase dates rarely. Every row
   * therefore starts as needing a cost basis, and the review screen is where
   * that gap actually closes — the tax desk cannot work without it.
   */
  it("flags every row as needing a cost basis, and says so once", () => {
    const r = parseCasText(NSDL);
    expect(r.holdings.every((h) => h.needsCostBasis)).toBe(true);
    expect(r.warnings.some((w) => /purchase date or price/i.test(w))).toBe(true);
  });

  it("ignores a repeated ISIN rather than double-counting it", () => {
    const r = parseCasText(`${NSDL}\nINE009A01021 INFOSYS LIMITED 40 1038.50 41540.00`);
    expect(r.holdings.filter((h) => h.isin === "INE009A01021")).toHaveLength(1);
  });

  /*
   * An unreadable file must not be a dead end. The review screen opens empty
   * and the customer types their holdings in — the parser is a shortcut past
   * typing, never an authority.
   */
  it("turns a file it cannot read into an empty review, not an error", () => {
    const r = parseCasText("this is not a statement at all");
    expect(r.holdings).toEqual([]);
    expect(r.warnings[0]).toMatch(/add them by hand/i);
  });
});
