import type { ImportMethod, ImportResult, ParsedHolding } from "@/lib/contracts/types";

/**
 * Consolidated Account Statement parsing.
 *
 * IDBI has no holdings API, so this is the route by which a real customer's
 * stocks and funds reach the product — the same one INDmoney, Kuvera and ET
 * Money use. One NSDL or CDSL statement carries both equities and funds, which
 * is why it is the file to ask for; CAMS and KFintech carry funds only.
 *
 * ## What this parser can and cannot promise
 *
 * It reads the text layer of the PDF and keys off **ISINs**, because an ISIN
 * is the one field every depository prints identically and it says what the
 * instrument is: `INE…` is a company, `INF…` is a mutual fund scheme. Names
 * and column orders differ between depositories and change between statement
 * versions; ISINs do not.
 *
 * It has **not been verified against a real NSDL or CDSL statement** — we have
 * none to test with — so it is built to be wrong safely rather than to be
 * trusted. Everything it finds goes to a review screen the user must confirm,
 * nothing is written until they do, and a file it cannot read at all opens
 * that screen empty rather than failing, so the customer can still type their
 * holdings in. The parser is a shortcut past typing, never an authority.
 *
 * ## Privacy
 *
 * A CAS is the most sensitive file in the product: PAN, address, email and the
 * complete portfolio. It is parsed **in memory and never persisted** — not to
 * disk, not to S3, not to a log — the buffer is dropped as soon as the text is
 * out, and the PAN is masked before it is ever returned. Under DPDP 2023 that
 * is an obligation; in the pitch it is a proof point.
 */

/** The slice of pdf.js this module uses. */
interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
  destroy: () => Promise<void>;
}

/** ISINs are 12 characters: country code, 9 alphanumerics, check digit. */
const ISIN = /\b(IN[EFD][0-9A-Z]{9})\b/g;

/** A PAN, so it can be masked out. Never returned or logged in full. */
const PAN = /\b([A-Z]{5})([0-9]{4})([A-Z])\b/;

export function maskPan(text: string): string {
  const m = text.match(PAN);
  return m ? `${m[1]}****${m[3]}` : "";
}

/** Which statement this is, from words every version of it prints. */
export function detectMethod(text: string): ImportMethod {
  const t = text.toUpperCase();
  if (t.includes("CDSL") || t.includes("CENTRAL DEPOSITORY")) return "cas_cdsl";
  if (t.includes("NSDL") || t.includes("NATIONAL SECURITIES DEPOSITORY")) return "cas_nsdl";
  if (t.includes("CAMS") || t.includes("KFINTECH") || t.includes("KARVY")) return "cas_cams";
  return "cas_nsdl";
}

/** Numbers as a statement prints them: 1,038.50 — grouping stripped. */
function numbers(window: string): number[] {
  return (window.match(/\d[\d,]*\.?\d*/g) ?? [])
    .map((n) => parseFloat(n.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * One holding, from the text around its ISIN.
 *
 * The window after an ISIN holds the name and then the numeric columns. Which
 * column is quantity and which is value differs by depository, so rather than
 * trusting a position we take the *smallest plausible* number as the unit
 * count and the largest as the value — quantities are small and rupee values
 * are large, and that relationship holds across every layout. Where it does
 * not, the review screen is where the user fixes it.
 */
function readHolding(isin: string, window: string, before = ""): ParsedHolding | undefined {
  const kind = isin[2] === "F" ? "mf" : isin[2] === "D" ? "bond" : "equity";

  /*
   * The name runs from the ISIN to the first numeric column. Digits stay in
   * the character class because real names contain them — 3M India, Tata
   * Motors DVR — so instead the trailing run of figures is trimmed off the
   * end. Without that, the holding is called "INFOSYS LIMITED 40 1038.50
   * 41540.00", which is what the first run of this actually produced.
   */
  const after = (window.match(/^[\s|]*([A-Za-z][A-Za-z0-9&.'()\- ]{3,60})/)?.[1] ?? "")
    .replace(/(\s+[\d.,]+)+\s*$/, "")
    .trim();

  // …except on a registrar's statement, where it runs the other way. See below.
  const name = after || nameBefore(before);
  const nums = numbers(window).filter((n) => n > 0);
  if (!nums.length) return undefined;

  const quantity = Math.min(...nums);
  const value = Math.max(...nums);

  return {
    kind,
    isin,
    name: name || isin,
    ...(kind === "mf" ? { schemeName: name } : {}),
    quantity,
    ...(value > quantity ? { value } : {}),
    // A CAS reliably gives holdings and unreliably gives purchase dates. The
    // tax desk needs both, so every row starts as needing a cost basis and the
    // review screen is where that gap actually closes.
    lots: [],
    needsCostBasis: true,
  };
}

/**
 * The scheme name where the registrar prints it *before* the ISIN.
 *
 * NSDL and CDSL name the instrument after its ISIN; CAMS and KFintech name the
 * scheme first and then run the units, the NAV, the transaction date and their
 * own name before it. Reading only forward, a real CAMS statement imported a
 * fund called "INF22M001093" — the identifier standing where the customer
 * expects to read the fund's name.
 *
 * So peel those columns off the end, right to left, and take what is left.
 */
function nameBefore(before: string): string {
  const trimmed = before
    // the registrar's own name sits immediately before the ISIN
    .replace(/\s+(CAMS|KFINTECH|KFIN|KARVY)\s*$/i, "")
    // then the NAV, the date, and the unit count
    .replace(/(\s+[\d.,]+)+\s*$/, "")
    .replace(/\s+\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}\s*$/, "")
    .replace(/(\s+[\d.,]+)+\s*$/, "");

  const m = trimmed.match(/([A-Za-z][A-Za-z0-9&.'()\-/ ]{6,80})\s*$/);
  return (m?.[1] ?? "")
    .replace(/(\s+[\d.,]+)+\s*$/, "")
    .trim();
}

/** Parse the extracted text of a statement. Exported so it can be tested. */
export function parseCasText(text: string): ImportResult {
  const method = detectMethod(text);
  const holdings: ParsedHolding[] = [];
  const seen = new Set<string>();

  /*
   * Collect the ISINs first, then take each holding's window as the text
   * *between* its ISIN and the next one. A fixed-width window runs into the
   * following row and picks up its numbers — which is how the first holding
   * ended up with a quantity of 1 read out of the next line's ISIN.
   */
  ISIN.lastIndex = 0;
  const found: { isin: string; at: number; from: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = ISIN.exec(text)) !== null) {
    found.push({ isin: match[1], at: match.index, from: match.index + match[1].length });
  }

  found.forEach((hit, i) => {
    if (seen.has(hit.isin)) return;
    seen.add(hit.isin);
    const end = i + 1 < found.length ? found[i + 1].from - found[i + 1].isin.length : text.length;
    // The text before this ISIN, bounded by the previous one so a holding can
    // never take its neighbour's name.
    const floor = i > 0 ? found[i - 1].from : 0;
    const before = text.slice(Math.max(floor, hit.at - 220), hit.at);
    const holding = readHolding(hit.isin, text.slice(hit.from, Math.min(end, hit.from + 200)), before);
    if (holding) holdings.push(holding);
  });

  const warnings: string[] = [];
  if (!holdings.length) {
    warnings.push(
      "No holdings could be read from this file. You can still add them by hand on the next screen — nothing is lost.",
    );
  }
  const missing = holdings.filter((h) => h.needsCostBasis).length;
  if (missing) {
    warnings.push(
      // Said without naming the instrument type: this fires for funds as often
      // as for shares, and "rarely carries them for shares" read as a mistake
      // on a statement that held nothing but a mutual fund.
      `${missing} holding${missing === 1 ? "" : "s"} came through without a purchase date or price — statements seldom carry them. Add what you remember and the tax work becomes possible.`,
    );
  }

  return {
    method,
    parsedAt: new Date().toISOString(),
    holdings,
    warnings,
    panMasked: maskPan(text),
  };
}

/**
 * Extract the text layer of a (possibly password-protected) PDF.
 *
 * The password on an NSDL or CDSL statement is the holder's **PAN in
 * uppercase**; CAMS and KFintech use one the customer chose when requesting
 * it. The buffer is not retained after this returns.
 */
export async function extractText(data: Uint8Array, password?: string): Promise<string> {
  /*
   * Imported lazily: pdf.js is large, and a build that never parses a CAS
   * should not pay for it on every cold start. The minified legacy build is
   * the one named in `outputFileTracingIncludes` — the tracer cannot follow a
   * dynamic import, and without that entry the standalone bundle shipped
   * without pdf.js at all and every upload answered "could not be read".
   *
   * Cast because the minified build has no type declarations beside it; the
   * two functions used are the documented ones.
   */
  const pdfjs = (await import(
    /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.min.mjs" as string
  )) as { getDocument: (o: Record<string, unknown>) => { promise: Promise<PdfDocument> } };
  const { getDocument } = pdfjs;
  const doc = await getDocument({
    data,
    password,
    useSystemFonts: true,
    // A statement is data, not a program. Nothing in it should be evaluated.
    isEvalSupported: false,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => (item && typeof item === "object" && "str" in item ? String(item.str) : ""))
        .join(" "),
    );
  }
  await doc.destroy();
  return pages.join("\n");
}

export async function parseCas(data: Uint8Array, password?: string): Promise<ImportResult> {
  return parseCasText(await extractText(data, password));
}
