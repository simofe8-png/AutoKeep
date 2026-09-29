import type { AcquiredDocument, PageText, TextItem, TextLine, TextReader } from './types';

/**
 * HTML → positioned text (pure). Block elements become lines; table cells become items whose x is
 * the cell's column index × 100, so the same grid extraction works for HTML tables and PDF tables.
 * Each <h1>/<h2> section starts a new "page" so locators stay precise on long single-page manuals.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  times: '×',
  deg: '°',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

export function htmlToPages(html: string): PageText[] {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ');
  const pages: PageText[] = [];
  let lines: TextLine[] = [];
  let y = 0;
  const flush = () => {
    if (lines.length) {
      pages.push({ n: pages.length + 1, lines, text: lines.map((l) => l.text).join('\n') });
    }
    lines = [];
    y = 0;
  };
  const push = (items: TextItem[]) => {
    const kept = items.filter((i) => i.str);
    if (!kept.length) return;
    lines.push({ y: y++, items: kept, text: kept.map((i) => i.str).join(' ') });
  };
  // Tokenize into tables and other blocks, in document order.
  const re =
    /<table\b[\s\S]*?<\/table>|<h[12]\b[\s\S]*?<\/h[12]>|<(p|li|h[3-6]|div|dt|dd|br|caption)\b[^>]*>|<\/(p|li|h[3-6]|div|dt|dd)>|[^<]+|<[^>]+>/gi;
  let text = '';
  const emitText = () => {
    const t = clean(text);
    if (t) push([{ str: t, x: 0, y, w: t.length }]);
    text = '';
  };
  for (const m of body.matchAll(re)) {
    const tok = m[0];
    if (/^<table\b/i.test(tok)) {
      emitText();
      for (const row of tok.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
        const cells = [...row[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
          clean(c[1]),
        );
        push(cells.map((str, i) => ({ str, x: i * 100, y, w: 90 })));
      }
    } else if (/^<h[12]\b/i.test(tok)) {
      emitText();
      flush();
      push([{ str: clean(tok), x: 0, y, w: 0 }]);
    } else if (/^<\/?(p|li|h[3-6]|div|dt|dd|br|caption)\b/i.test(tok)) {
      emitText();
    } else if (tok.startsWith('<')) {
      // inline tag: keep a word boundary
      text += ' ';
    } else {
      text += tok;
    }
  }
  emitText();
  flush();
  return pages;
}

export const htmlTextReader: TextReader = {
  async read(doc: AcquiredDocument) {
    return htmlToPages(new TextDecoder().decode(doc.bytes));
  },
};

/** Anchors of an HTML page (href resolved against the page URL). */
export function anchorsOf(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  for (const m of html.matchAll(
    /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const raw = decodeEntities(m[2] ?? m[3] ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel):/i.test(raw)) continue;
    try {
      out.push({ href: new URL(raw, base).toString(), text: clean(m[4]) });
    } catch {
      // malformed href: ignored
    }
  }
  return out;
}
