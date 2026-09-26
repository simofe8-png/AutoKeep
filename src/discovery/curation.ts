/**
 * Curation check (ADR-0017 amendment, G3). A curated schedule is only as good as its transcription,
 * so before a person approves one, every item's quote must be found on the page it cites in the
 * pinned document. Pure: page texts in, findings out (the desktop tool does the PDF I/O).
 * Deliberately dependency-free so `tools/curate-check.mjs` can run it directly under Node.
 */

export interface CurationQuote {
  interval: string;
  title: string;
  page: number;
  quote: string;
}

export type CurationFinding =
  | { ok: true; quote: CurationQuote }
  | {
      ok: false;
      quote: CurationQuote;
      reason: 'page_out_of_range' | 'quote_not_on_page' | 'empty';
    };

/** Whitespace, line-end hyphenation, bidi marks and typographic quotes are layout, not text. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[‘’׳]/g, "'")
    .replace(/[“”״]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `pages[0]` is page 1. Every quote must appear verbatim (after normalization) on its page. */
export function checkQuotes(
  pages: readonly string[],
  quotes: readonly CurationQuote[],
): CurationFinding[] {
  const norm = pages.map(normalizeForMatch);
  // PDF text runs can split words differently from the visual layout; also compare unspaced.
  const squashed = norm.map((p) => p.replace(/ /g, ''));
  return quotes.map((quote): CurationFinding => {
    const q = normalizeForMatch(quote.quote);
    if (!q) return { ok: false, quote, reason: 'empty' };
    if (quote.page < 1 || quote.page > pages.length) {
      return { ok: false, quote, reason: 'page_out_of_range' };
    }
    const i = quote.page - 1;
    const found = norm[i].includes(q) || squashed[i].includes(q.replace(/ /g, ''));
    return found ? { ok: true, quote } : { ok: false, quote, reason: 'quote_not_on_page' };
  });
}

/** Flattens a curated schedule's items into the quotes to check. */
export function quotesOf(curated: {
  intervals: readonly {
    label: string;
    items: readonly { title: string; page: number; quote: string }[];
  }[];
}): CurationQuote[] {
  return curated.intervals.flatMap((iv) =>
    iv.items.map((it) => ({ interval: iv.label, title: it.title, page: it.page, quote: it.quote })),
  );
}
