import type { PageText, TextLine } from '../../types';
import { extractSentences, regimeMapOf, sentencesOf, splitColumns } from '../sentences';

/** SYNTHETIC two-column page modelled on owner's-manual layouts (invented values). */
function twoColumnPage(left: string[], right: string[]): PageText {
  const n = Math.max(left.length, right.length);
  const lines: TextLine[] = [];
  for (let i = 0; i < n; i += 1) {
    const items = [
      ...(left[i] ? [{ str: left[i], x: 60, y: 100 + i * 12, w: 190 }] : []),
      ...(right[i] ? [{ str: right[i], x: 271, y: 100 + i * 12, w: 190 }] : []),
    ];
    lines.push({ y: 100 + i * 12, items, text: items.map((x) => x.str).join(' ') });
  }
  return { n: 7, lines, text: lines.map((l) => l.text).join('\n') };
}

const LEFT = Array.from(
  { length: 22 },
  (_, i) => `Bonnet safety note line ${i} about closing it properly.`,
);
const RIGHT = [
  'Service intervals',
  'Service intervals can be flexible (LongLife service) or fixed (dependent on',
  'time/distance travelled).',
  'If the PR code that appears on the back of the Maintenance Programme',
  'booklet is QG7, this means that your vehicle has the LongLife service pro-',
  'grammed. If it has the codes QG8 or QG9 the interval service is dependent',
  'on time/distance travelled.',
  'Fixed service intervals*',
  'If your vehicle does not have the LongLife service interval or it has been',
  'disabled, your vehicle must be serviced after a fixed interval of 1 year / 12 345 km',
  '(whatever comes first).',
  'Service interval display',
  'If the display is reset manually, the next service interval will be indicated after',
  '12 345 km or one year.',
  'Note',
  'With LongLife the vehicle is serviced every 2 years or 23 456 km, unless your vehicle has fixed service intervals.',
];

const doc = {
  lead: { url: 'u', title: 'Manual', via: 'web_search' as const, adapter: 't' },
  url: 'u',
  finalUrl: 'u',
  host: 'h',
  sha256: 'a'.repeat(64),
  format: 'pdf' as const,
  bytes: new Uint8Array(),
  system: null,
};
const input = (pages: PageText[]) => ({
  doc,
  pages,
  kind: 'car' as const,
  make: 'testmake',
  authorityHint: 'vehicle_document' as const,
  markets: [],
  models: ['Ibiza'],
  years: { from: 2008, to: 2015 },
  today: '2026-10-02' as never,
});

describe('column-aware sentence extraction', () => {
  it('splits two columns and joins hyphenated sentences across lines', () => {
    const cols = splitColumns(twoColumnPage(LEFT, RIGHT));
    expect(cols).toHaveLength(2);
    const sentences = sentencesOf(cols[1]).map((s) => s.text);
    expect(sentences).toContain(
      'If the PR code that appears on the back of the Maintenance Programme booklet is QG7, this means that your vehicle has the LongLife service programmed.',
    );
  });

  it('reads the fixed periodic service with its regime from the subsection heading', () => {
    const { extracted, skipped } = extractSentences(input([twoColumnPage(LEFT, RIGHT)]));
    expect(
      extracted.map((e) => [
        e.requirement.task,
        e.requirement.interval,
        e.requirement.applicability.serviceRegimes,
      ]),
    ).toEqual([
      [
        'periodic_service',
        {
          every: { value: 12345, unit: 'km' },
          everyMonths: 12,
          first: null,
          rule: 'whichever_first',
          repeats: true,
        },
        ['FIXED'],
      ],
    ]);
    expect(extracted[0].requirement.evidence[0]).toMatchObject({
      page: 7,
      section: 'Fixed service intervals',
    });
    // Display sentence and the competing-regime sentence are skipped, never guessed.
    expect(skipped.map((s) => s.reason).sort()).toEqual([
      'competing service regimes',
      'display / conditional',
    ]);
  });

  it('the document’s own regime-code mapping is read (never assumed)', () => {
    expect(regimeMapOf([twoColumnPage(LEFT, RIGHT)])).toEqual({
      LONGLIFE: ['QG7'],
      FIXED: ['QG8', 'QG9'],
    });
    expect(
      regimeMapOf([twoColumnPage(LEFT, ['Service intervals', 'Fixed service every year.'])]),
    ).toEqual({});
  });

  it('German, Spanish and French interval phrasing', () => {
    const lines = (texts: string[]): PageText => {
      const ls = texts.map((t, i) => ({
        y: i * 12,
        items: [{ str: t, x: 40, y: i * 12, w: 300 }],
        text: t,
      }));
      return { n: 1, lines: ls, text: texts.join('\n') };
    };
    const { extracted } = extractSentences(
      input([
        lines([
          'Zündkerzen wechseln: alle 60.000 km oder alle 6 Jahre.',
          'Cambiar el líquido de frenos cada 2 años.',
          'Remplacer le filtre à air tous les 30 000 km.',
          'Ölwechsel bei Bedarf alle 15.000 km.',
        ]),
      ]),
    );
    expect(
      extracted.map((e) => [
        e.requirement.task,
        e.requirement.action,
        e.requirement.interval.every?.value ?? null,
        e.requirement.interval.everyMonths ?? null,
      ]),
    ).toEqual([
      ['spark_plugs', 'replacement', 60000, 72],
      ['brake_fluid', 'replacement', null, 24],
      ['air_filter', 'replacement', 30000, null],
    ]);
  });

  it('never reads a car age or a second item as the interval (live regressions)', () => {
    const lines = (texts: string[]): PageText => {
      const ls = texts.map((t, i) => ({
        y: i * 12,
        items: [{ str: t, x: 40, y: i * 12, w: 300 }],
        text: t,
      }));
      return { n: 1, lines: ls, text: texts.join('\n') };
    };
    const { extracted, skipped } = extractSentences(
      input([
        lines([
          'For cars aged three to 15 years old, the maker recommends an interim service every 10,000 miles.',
          'Kühlflüssigkeit wechseln nach 10 Jahren, Luftfilter alle 75.000 km wechseln.',
          'Die erste Inspektion ist nach 15.000 km fällig, danach alle 30.000 km.',
        ]),
      ]),
    );
    expect(extracted.map((e) => [e.requirement.task, e.requirement.interval])).toEqual([
      [
        'periodic_service',
        { every: { value: 10000, unit: 'mi' }, first: null, rule: 'distance_only', repeats: true },
      ],
    ]);
    expect(skipped.map((x) => x.reason).sort()).toEqual([
      'first occurrence only',
      'several items in one sentence',
    ]);
  });
});
