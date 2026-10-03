import type { PageText, TextLine } from '../../types';
import { buildFingerprint } from '../fingerprint';
import { extractIntervalMatrix } from '../intervalMatrix';

/**
 * Interval-overview matrix tables. SYNTHETIC page laid out like a manufacturer's overview
 * (fictional make "Testa" and model "Orion", invented intervals): header with an extra-service
 * column and interval columns, model rows with production windows and engine qualifiers, marks.
 */

const item = (x: number, str: string) => ({ str, x, y: 0, w: str.length * 4 });
const line = (y: number, items: [number, string][]): TextLine => ({
  y,
  items: items.map(([x, s]) => ({ ...item(x, s), y })),
  text: items.map(([, s]) => s).join(' '),
});

const PAGE: PageText = {
  n: 1,
  lines: [
    line(60, [[60, 'Service Interval Overview']]),
    line(80, [[230, 'Interim']]),
    line(87, [[230, 'Service']]),
    line(91, [
      [281, '1 Year'],
      [301, '1 Year'],
      [386, '2 Year'],
    ]),
    line(95, [[232, '1 Year']]),
    line(98, [
      [60, 'Model'],
      [280, '(10k ml)'],
      [299, '(12,5k ml)'],
      [383, '(20k mi)'],
    ]),
    line(101, [[231, '(6k ml)']]),
    line(110, [
      [60, 'Orion (07/2008-10/2012)'],
      [282, 'X'],
    ]),
    line(116, [
      [60, 'Orion (10/2012-04.2017)'],
      [301, 'X'],
    ]),
    line(122, [
      [60, 'Orion 1.0L EcoBoost (12/2016-)'],
      [385, 'X'],
    ]),
    line(128, [
      [60, 'Orion 1.5L Duratorq TDCi (08/2018-)'],
      [232, 'X'],
      [385, 'X'],
    ]),
    line(134, [
      [60, 'Orion ST 1.5L EcoBoost (12/2017-)'],
      [301, 'X'],
    ]),
    line(140, [
      [60, 'Orion 1.0L FFV (01/2015-)'],
      [301, 'X'],
    ]),
    line(146, [
      [60, 'Lyra (01/2010-12/2016)'],
      [301, 'X'],
    ]),
  ],
  text: '',
};
PAGE.text = PAGE.lines.map((l) => l.text).join('\n');

const fp = (() => {
  const r = buildFingerprint({
    kind: 'car',
    manufacturer: 'Testa',
    model: 'ORION',
    year: 2015,
    fuel: 'בנזין',
  });
  if (!r.ok) throw new Error('fixture');
  return r.fingerprint;
})();

const run = () =>
  extractIntervalMatrix({
    doc: { sha256: 'a'.repeat(64), lead: { title: 'Overview' }, finalUrl: 'x' } as never,
    pages: [PAGE],
    fp,
    authorityHint: 'manufacturer',
    markets: [],
    today: '2026-10-03' as never,
  });

describe('extractIntervalMatrix', () => {
  it('reads each model row × marked column as the main-service interval, with the row window', () => {
    const rows = run().extracted.map((m) => ({
      every: m.extracted.requirement.interval.every,
      months: m.extracted.requirement.interval.everyMonths,
      rule: m.extracted.requirement.interval.rule,
      years: m.rowYears,
      applicability: m.extracted.requirement.applicability,
      task: m.extracted.requirement.task,
    }));
    expect(rows).toContainEqual({
      every: { value: 10000, unit: 'mi' },
      months: 12,
      rule: 'whichever_first',
      years: { from: 2008, to: 2012 },
      applicability: {},
      task: 'periodic_service',
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        every: { value: 12500, unit: 'mi' },
        months: 12,
        years: { from: 2012, to: 2017 },
        applicability: {},
      }),
    );
  });

  it('engine words restrict a row (displacement, diesel); an open window stays open', () => {
    const rows = run().extracted.map((m) => m.extracted.requirement);
    expect(rows).toContainEqual(
      expect.objectContaining({
        interval: expect.objectContaining({ every: { value: 20000, unit: 'mi' }, everyMonths: 24 }),
        applicability: { displacementCc: { min: 950, max: 1049 }, powertrains: ['petrol'] },
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        applicability: { displacementCc: { min: 1450, max: 1549 }, powertrains: ['diesel'] },
      }),
    );
  });

  it('never reads an extra-service column, another variant, an alternative-fuel row or another model', () => {
    const out = run();
    // Interim column (6k): never a main-service interval.
    expect(out.extracted.some((m) => m.extracted.requirement.interval.every?.value === 6000)).toBe(
      false,
    );
    const labels = out.extracted.map((m) => m.extracted.requirement.taskText ?? '');
    expect(labels.some((t) => /Orion ST/.test(t))).toBe(false);
    expect(labels.some((t) => /FFV/.test(t))).toBe(false);
    expect(labels.some((t) => /Lyra/.test(t))).toBe(false);
    expect(out.skipped).toContainEqual(expect.objectContaining({ reason: 'alternative-fuel row' }));
  });

  it('grounding tokens are the row label and the column header the mark sits under', () => {
    const m = run().extracted.find((x) => x.rowYears.from === 2012)!;
    expect(m.extracted.groundTokens).toEqual(['Orion', '(12,5k ml)', '1 Year']);
  });
});
