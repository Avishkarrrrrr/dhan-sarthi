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

/*
 * CAMS and KFintech put the scheme name *before* the ISIN, with the units, the
 * NAV, the date and the registrar's own name in between. NSDL and CDSL put the
 * instrument name after it. The parser only looked forward, so a real CAMS
 * statement imported a fund called "INF22M001093" — the ISIN itself — which is
 * the machine identifier appearing where the customer expects the fund's name.
 *
 * The layout below is modelled on a real CAMS statement's text layer.
 */
describe("a registrar statement that names the scheme before the ISIN", () => {
  const camsLine =
    "ISIN Cost Value (INR) 1831148 5,488.75 " +
    "JIO180 - JioBlackRock Flexi Cap Fund - Direct - Growth (Non-Demat) " +
    "555.165 21-Sep-2026 9.8867 CAMS INF22M001093 5,500.000 Total";

  it("reads the scheme name that sits before the ISIN", () => {
    const { holdings } = parseCasText(camsLine);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].name).toMatch(/JioBlackRock Flexi Cap Fund/);
    expect(holdings[0].name).not.toBe(holdings[0].isin);
  });

  it("still classifies it from the ISIN, not the name", () => {
    const { holdings } = parseCasText(camsLine);
    expect(holdings[0].kind).toBe("mf");
    expect(holdings[0].schemeName).toMatch(/JioBlackRock/);
  });

  it("does not disturb a statement that names the instrument after the ISIN", () => {
    const cdslLine = "INE370A01013 ECO RECYCLING LIMITED 120 45.50 5460.00";
    const { holdings } = parseCasText(cdslLine);
    expect(holdings[0].name).toMatch(/ECO RECYCLING/);
  });
});
