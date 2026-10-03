import { KnownCandidatesAdapter } from '../adapters';
import { makeCandidate } from '../candidates';
import { buildFingerprint } from '../fingerprint';
import { pdfReader } from '../node/host';
import { runMSource } from '../run';
import { ALLOW_ALL, FakeWeb, fakeDeps, minimalPdf } from '../testing';

/**
 * PDF schedule through the real, isolated pdfjs reader (child process). SYNTHETIC document:
 * fictional publisher, invented test intervals.
 */
const r = buildFingerprint({
  kind: 'car',
  manufacturer: 'סיאט ספרד',
  model: 'IBIZA',
  year: 2012,
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
});
if (!r.ok) throw new Error('fixture');
const fp = r.fingerprint;

const PDF = minimalPdf([
  'SEAT Ibiza 2008-2015 maintenance schedule',
  'Petrol engines 1.4 16V (CGG)',
  'Engine oil: replace every 15,000 km or 12 months, whichever comes first.',
  'Brake fluid: replace every 24 months.',
]);

const hosts = ['docs.example-pdfs.com', 'www.example-books.org'];
const pages = Object.fromEntries(
  hosts.flatMap((h) => [
    [`https://${h}/robots.txt`, { contentType: 'text/plain', body: ALLOW_ALL }],
    [`https://${h}/ibiza.pdf`, { contentType: 'application/pdf', body: PDF }],
  ]),
);

it('a PDF schedule is read in an isolated parser, matched (engine code CGG) and resolved', async () => {
  // Same bytes on two hosts = one document: give the second a distinct edition.
  pages['https://www.example-books.org/ibiza.pdf'] = {
    contentType: 'application/pdf',
    body: minimalPdf([
      'SEAT Ibiza 2008-2015 service intervals for all engines (independent guide)',
      'Engine oil: replace every 15,000 km or 12 months, whichever comes first.',
    ]),
  };
  const web = new FakeWeb(pages);
  const run = await runMSource(
    fp,
    fakeDeps(
      web,
      [
        new KnownCandidatesAdapter(
          hosts.map((h) =>
            makeCandidate({
              url: `https://${h}/ibiza.pdf`,
              sourceType: 'independent_database',
              discoveredBy: 'catalog',
              discoveredAt: 't',
            })!,
          ),
        ),
      ],
      { readers: { pdf: pdfReader(60_000), html: { read: async () => [] } } },
    ),
  );
  const s = run.schedule!;
  const first = s.sources.find((x) => x.finalUrl.includes('example-pdfs'))!;
  expect(first.format).toBe('pdf');
  expect(first.statedApplicability).toMatchObject({
    yearFrom: 2008,
    yearTo: 2015,
    engineCodes: ['CGG'],
  });
  const oil = s.items.find((i) => i.task === 'engine_oil')!;
  expect(oil).toMatchObject({ intervalKm: 15000, intervalMonths: 12, independentSources: 2 });
  const brake = s.evidence.find((e) => e.task === 'brake_fluid')!;
  expect(brake).toMatchObject({
    intervalMonths: 24,
    intervalKm: null,
    rule: 'TIME_ONLY',
    sourceLocation: { page: 1 },
  });
  expect(brake.match.dimensions.engineCode).toBe('match');
}, 120_000);
