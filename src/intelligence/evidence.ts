import type { EvidenceRef } from './schemas';

/**
 * T090: page/section evidence grounding. An AI-proposed fact is kept only if its cited quote is
 * actually present on the cited page of the ORIGINAL document text. This is the anti-invention
 * check: a model cannot introduce a maintenance requirement that the document does not contain.
 */

/** Builds a character from a code point (keeps invisible characters out of the source). */
const u = (cp: number) => String.fromCharCode(cp);
/** Hebrew geresh/gershayim, ASCII and typographic quotes (all dropped for matching). */
const QUOTES = new RegExp(
  `[${[0x05f3, 0x05f4, 0x27, 0x22, 0x60, 0x2018, 0x2019, 0x201c, 0x201d].map(u).join('')}]`,
  'g',
);
/** Hyphen, dashes and minus sign → ASCII hyphen. */
const DASHES = new RegExp(`[${u(0x2010)}-${u(0x2015)}${u(0x2212)}]`, 'g');
/** Thousands separators inside numbers ("15,000" → "15000"; Arabic comma too). */
const DIGIT_GROUPING = new RegExp(`(\\d)[,${u(0x066c)}](?=\\d{3}\\b)`, 'g');

/** Normalizes OCR/AI text for comparison: case, whitespace, quotes/dashes, digit grouping. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(QUOTES, '')
    .replace(DASHES, '-')
    .replace(DIGIT_GROUPING, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word tokens; punctuation separates tokens so OCR comma/period noise does not break matches. */
const tokens = (s: string) =>
  normalizeForMatch(s)
    .split(/[\s,.;:!?()[\]{}/\\|*•-]+/)
    .filter((t) => t.length > 1);

export interface Grounding {
  grounded: boolean;
  page: number;
  method: 'exact' | 'fuzzy' | 'none';
  /** Share of quote tokens found on the page (for fuzzy matches). */
  score: number;
}

/** Minimum token coverage to accept an OCR-noisy quote (not a paraphrase). */
export const FUZZY_MIN = 0.9;

export function groundQuote(
  pages: readonly { number: number; text: string }[],
  ref: EvidenceRef,
): Grounding {
  const page = pages.find((p) => p.number === ref.page);
  if (!page) return { grounded: false, page: ref.page, method: 'none', score: 0 };
  const hay = normalizeForMatch(page.text);
  const needle = normalizeForMatch(ref.quote);
  if (needle.length >= 3 && hay.includes(needle)) {
    return { grounded: true, page: ref.page, method: 'exact', score: 1 };
  }
  const q = tokens(ref.quote);
  if (q.length < 3) return { grounded: false, page: ref.page, method: 'none', score: 0 };
  const pageTokens = new Set(tokens(page.text));
  const score = q.filter((t) => pageTokens.has(t)).length / q.length;
  return score >= FUZZY_MIN
    ? { grounded: true, page: ref.page, method: 'fuzzy', score }
    : { grounded: false, page: ref.page, method: 'none', score };
}
