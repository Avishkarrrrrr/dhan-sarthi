/**
 * Transaction categories, and knowing when we do not have one.
 *
 * The IDBI sandbox labels every statement row "S1 TXN 7" or "F1 FinPro 3" —
 * serial references, not descriptions — and stamps them all `txnCat: "TCI"`.
 * There is no merchant narration to read. Passing that through as a spending
 * category puts "S1 TXN 19" on a chart axis and in a nudge that reads "Top
 * spend: S1 TXN 19", which makes a working product look broken.
 *
 * Inventing categories from those strings is the other way to get it wrong, so
 * the rule here is to say plainly that the feed is uncategorised and show what
 * the statement *does* support — money in, money out, and the largest debits.
 */

export const UNCATEGORISED = "Uncategorised";

/** A reference number pretending to be a description. */
export function isPlaceholderCategory(category: string): boolean {
  const c = (category ?? "").trim();
  if (!c || c === UNCATEGORISED) return true;
  return /^[A-Z]\d+\s+(TXN|FinPro)\s+\d+$/i.test(c);
}

/** What to store for a row whose description carries no meaning. */
export function cleanCategory(raw: string | undefined | null): string {
  const c = (raw ?? "").trim();
  return isPlaceholderCategory(c) ? UNCATEGORISED : c;
}
