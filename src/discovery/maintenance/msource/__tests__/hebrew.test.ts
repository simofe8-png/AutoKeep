import { buildFingerprint } from '../fingerprint';
import { ownerProposals, uploadIssues } from '../ownerReview';
import { readOwnerDocuments } from '../run';
import { readerDeps } from '../testing';

/**
 * A Hebrew booklet page (owner decision 2026-10-04: booklets in Hebrew and English). SYNTHETIC
 * text: invented intervals in typical Hebrew booklet phrasing.
 */
it('Hebrew items, distances and months are read and proposed to the owner', async () => {
  const fp = buildFingerprint({
    kind: 'car',
    manufacturer: 'פורד גרמניה',
    model: 'FIESTA',
    year: 2015,
    engine: '1242 סמ״ק',
    engineCode: 'SNJB',
    fuel: 'בנזין',
  });
  if (!fp.ok) throw new Error('fixture');
  const html =
    '<html><head><title>תוכנית טיפולים</title></head><body><h1>לוח טיפולים תקופתיים</h1>' +
    '<p>החלפת שמן מנוע ומסנן שמן: כל 15,000 ק"מ או 12 חודשים, המוקדם מביניהם.</p>' +
    '<p>החלפת נוזל בלמים: כל 24 חודשים.</p>' +
    '<p>החלפת מסנן אוויר: כל 30,000 ק"מ.</p>' +
    '<p>החלפת מצתים: כל 60,000 ק״מ או 48 חודשים.</p></body></html>';
  const run = await readOwnerDocuments(
    fp.fingerprint,
    [{ id: 'd', name: 'booklet.html', bytes: new TextEncoder().encode(html) }],
    readerDeps(),
  );
  // The page does not name the model / years: the owner confirms it is this vehicle's.
  expect(
    ownerProposals(run.schedule!).map((p) => [p.task, p.intervalKm, p.intervalMonths, p.fit]),
  ).toEqual([
    ['engine_oil', 15000, 12, 'unstated'],
    ['brake_fluid', null, 24, 'unstated'],
    ['air_filter', 30000, null, 'unstated'],
    ['spark_plugs', 60000, 48, 'unstated'],
  ]);
});

describe('a photographed booklet page (read on the device by OCR)', () => {
  const fp = buildFingerprint({
    kind: 'car',
    manufacturer: 'פורד גרמניה',
    model: 'FIESTA',
    year: 2015,
    engine: '1242 סמ״ק',
    fuel: 'בנזין',
  });
  // A JPEG's first bytes (the photo itself is read by the OCR port, faked here).
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const line = (y: number, text: string) => ({
    y,
    text,
    items: text.split(' ').map((str, i) => ({ str, x: 1000 - i * 60, y, w: 50 })),
  });
  const ocr = (texts: string[]) => ({
    read: async () => {
      const lines = texts.map((t, i) => line(60 + i * 100, t));
      return [{ n: 1, lines, text: texts.join('\n') }];
    },
  });

  it('the recognized lines are extracted like any page and proposed to the owner', async () => {
    if (!fp.ok) throw new Error('fixture');
    const run = await readOwnerDocuments(
      fp.fingerprint,
      [{ id: 'p1', name: 'booklet-photo.jpg', bytes: JPEG }],
      readerDeps({
        readers: {
          pdf: null,
          html: { read: async () => [] },
          image: ocr([
            'לוח טיפולים תקופתיים',
            'החלפת שמן מנוע ומסנן שמן: כל 15,000 ק"מ או 12 חודשים',
            'החלפת נוזל בלמים: כל 24 חודשים',
          ]),
        },
      }),
    );
    expect(run.schedule!.sources[0]).toMatchObject({ format: 'image', sourceType: 'user_upload' });
    expect(
      ownerProposals(run.schedule!).map((p) => [p.task, p.intervalKm, p.intervalMonths]),
    ).toEqual([
      ['engine_oil', 15000, 12],
      ['brake_fluid', null, 24],
    ]);
  });

  it('a photo with no readable text is reported as such (never silent)', async () => {
    if (!fp.ok) throw new Error('fixture');
    const run = await readOwnerDocuments(
      fp.fingerprint,
      [{ id: 'p2', name: 'blurry.jpg', bytes: JPEG }],
      readerDeps({ readers: { pdf: null, html: { read: async () => [] }, image: ocr([]) } }),
    );
    expect(uploadIssues(run.candidates)).toEqual([
      { documentName: 'blurry.jpg', reason: 'unreadable_photo' },
    ]);
  });
});
