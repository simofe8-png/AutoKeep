import { checkQuotes, normalizeForMatch, quotesOf } from '../curation';

const q = (page: number, quote: string) => ({ interval: 'i', title: 't', page, quote });

describe('curation check (G3)', () => {
  const pages = [
    'Contents\nMaintenance',
    'Replace engine\n oil every 15,000 km or 12 ‎months.\nInspect brake pads.',
    'החלפת מסנן אוויר כל 30,000 ק״מ',
  ];

  it('finds quotes on their cited page despite layout whitespace and bidi marks', () => {
    const r = checkQuotes(pages, [
      q(2, 'Replace engine oil every 15,000 km or 12 months'),
      q(3, 'החלפת מסנן אוויר כל 30,000 ק"מ'),
    ]);
    expect(r.every((f) => f.ok)).toBe(true);
  });

  it('rejects a quote on the wrong page, a changed quote, an empty one and a bad page', () => {
    const r = checkQuotes(pages, [
      q(1, 'Replace engine oil every 15,000 km'),
      q(2, 'Replace engine oil every 10,000 km'),
      q(2, '   '),
      q(9, 'Inspect brake pads'),
    ]);
    expect(r.map((f) => (f.ok ? 'ok' : f.reason))).toEqual([
      'quote_not_on_page',
      'quote_not_on_page',
      'empty',
      'page_out_of_range',
    ]);
  });

  it('normalizes only layout, never content (numbers stay significant)', () => {
    expect(normalizeForMatch('  15,000\n km ')).toBe('15,000 km');
    expect(normalizeForMatch('15,000 km')).not.toBe(normalizeForMatch('10,000 km'));
  });

  it('flattens every curated item for checking', () => {
    expect(
      quotesOf({ intervals: [{ label: 'A', items: [{ title: 'x', page: 2, quote: 'y' }] }] }),
    ).toEqual([{ interval: 'A', title: 'x', page: 2, quote: 'y' }]);
  });
});
