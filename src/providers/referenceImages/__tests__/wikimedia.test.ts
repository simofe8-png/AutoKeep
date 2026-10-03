import {
  licenseVerdict,
  lookupModelPhoto,
  modelPhotoQuery,
  plausibleTitle,
  wikimediaImageUrl,
  type ModelPhotoQuery,
} from '../wikimedia';

/**
 * General model photos (owner decision 2026-10-03). The API answers below are SYNTHETIC, shaped
 * like the Wikipedia / Commons API (formatversion=2); no network is used.
 */

const NOW = () => '2026-10-03T12:00:00.000Z';

const pageAnswer = (title: string, pageimage?: string, disambiguation = false) => ({
  query: {
    pages: [
      {
        title,
        ...(pageimage ? { pageimage } : {}),
        ...(disambiguation ? { pageprops: { disambiguation: '' } } : {}),
      },
    ],
  },
});
const missing = { query: { pages: [{ title: 'Nope', missing: true }] } };
const fileAnswer = (
  meta: Record<string, string>,
  thumburl = 'https://upload.wikimedia.org/x/800px-Car.jpg',
) => ({
  query: {
    pages: [
      {
        title: 'File:Car.jpg',
        imageinfo: [
          {
            thumburl,
            thumbwidth: 800,
            thumbheight: 450,
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Car.jpg',
            mime: 'image/jpeg',
            extmetadata: Object.fromEntries(
              Object.entries(meta).map(([k, v]) => [k, { value: v }]),
            ),
          },
        ],
      },
    ],
  },
});
const BY_SA = {
  License: 'cc-by-sa-4.0',
  LicenseShortName: 'CC BY-SA 4.0',
  LicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  Artist: '<a href="//commons.wikimedia.org/wiki/User:Example">Example Photographer</a>',
};

/** Fake API: answers by request kind; records every URL it was asked. */
function api(answers: { title?: unknown; search?: unknown; file?: unknown }) {
  const asked: string[] = [];
  const getJson = async (url: string) => {
    asked.push(url);
    if (url.includes('prop=imageinfo')) return answers.file;
    if (url.includes('generator=search')) return answers.search ?? { query: { pages: [] } };
    return answers.title ?? missing;
  };
  return { asked, getJson };
}

const COROLLA: ModelPhotoQuery = {
  classKey: 'wm1/toyota/corolla',
  make: 'Toyota',
  model: 'Corolla',
};

describe('modelPhotoQuery', () => {
  it('maps Hebrew registry makes to English names and keeps the commercial model', () => {
    expect(modelPhotoQuery('טויוטה יפן', 'COROLLA')).toEqual(COROLLA);
    expect(modelPhotoQuery('הונדה', 'XR650L')).toMatchObject({ make: 'Honda', model: 'XR650L' });
    expect(modelPhotoQuery('יונדאי', 'IONIQ')).toMatchObject({ make: 'Hyundai', model: 'Ioniq' });
    expect(modelPhotoQuery('קיה', 'PICANTO')).toMatchObject({ make: 'Kia', model: 'Picanto' });
    expect(modelPhotoQuery('סוזוקי', 'SWIFT')).toMatchObject({ make: 'Suzuki' });
    expect(modelPhotoQuery('ימאהה', 'TMAX')).toMatchObject({ make: 'Yamaha' });
  });

  it('never guesses: unknown make or a Hebrew-only model → no lookup', () => {
    expect(modelPhotoQuery('יצרן לא מוכר', 'X1')).toBeNull();
    expect(modelPhotoQuery('טויוטה', 'קורולה')).toBeNull();
  });
});

describe('licenseVerdict', () => {
  it('accepts public domain, CC0, CC BY and CC BY-SA, with the author as plain text', () => {
    expect(
      licenseVerdict(Object.fromEntries(Object.entries(BY_SA).map(([k, v]) => [k, { value: v }]))),
    ).toEqual({
      ok: true,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      author: 'Example Photographer',
    });
    for (const code of ['cc0', 'pd', 'cc-by-2.0']) {
      expect(licenseVerdict({ License: { value: code } }).ok).toBe(true);
    }
  });

  it('rejects non-free (fair use), NC, ND, unknown and missing licenses', () => {
    expect(
      licenseVerdict({ License: { value: 'cc-by-sa-4.0' }, NonFree: { value: 'true' } }).ok,
    ).toBe(false);
    expect(licenseVerdict({ License: { value: 'cc-by-nc-2.0' } }).ok).toBe(false);
    expect(licenseVerdict({ License: { value: 'cc-by-nd-4.0' } }).ok).toBe(false);
    expect(licenseVerdict({ LicenseShortName: { value: 'All rights reserved' } }).ok).toBe(false);
    expect(licenseVerdict(undefined).ok).toBe(false);
  });
});

describe('lookupModelPhoto', () => {
  it('direct title → license-checked lead image, credited; only make + model are sent', async () => {
    const { asked, getJson } = api({
      title: pageAnswer('Toyota Corolla', 'Car.jpg'),
      file: fileAnswer(BY_SA),
    });
    const r = await lookupModelPhoto(COROLLA, getJson, NOW);
    expect(r).toMatchObject({
      status: 'found',
      record: {
        imageUrl: 'https://upload.wikimedia.org/x/800px-Car.jpg',
        credit: 'Example Photographer · CC BY-SA 4.0 · Wikimedia Commons',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Car.jpg',
        articleTitle: 'Toyota Corolla',
        classKey: 'wm1/toyota/corolla',
      },
    });
    expect(asked).toHaveLength(2);
    expect(asked.every((u) => u.startsWith('https://en.wikipedia.org/w/api.php?'))).toBe(true);
    expect(decodeURIComponent(asked[0])).toContain('titles=Toyota Corolla');
  });

  it('disambiguation / missing → search fallback, accepted only when the title names both', async () => {
    const ok = api({
      title: pageAnswer('Corolla', 'X.jpg', true),
      search: pageAnswer('Toyota Corolla (E170)', 'Car.jpg'),
      file: fileAnswer(BY_SA),
    });
    expect(await lookupModelPhoto(COROLLA, ok.getJson, NOW)).toMatchObject({
      status: 'found',
      record: { articleTitle: 'Toyota Corolla (E170)' },
    });
    const wrong = api({ search: pageAnswer('Toyota Camry', 'Camry.jpg'), file: fileAnswer(BY_SA) });
    expect(await lookupModelPhoto(COROLLA, wrong.getJson, NOW)).toMatchObject({ status: 'none' });
    expect(wrong.asked.some((u) => u.includes('imageinfo'))).toBe(false);
  });

  it('a restricted license or a foreign image host → none (never shown)', async () => {
    const nc = api({
      title: pageAnswer('Toyota Corolla', 'Car.jpg'),
      file: fileAnswer({ License: 'cc-by-nc-2.0', LicenseShortName: 'CC BY-NC 2.0' }),
    });
    expect(await lookupModelPhoto(COROLLA, nc.getJson, NOW)).toMatchObject({ status: 'none' });
    const host = api({
      title: pageAnswer('Toyota Corolla', 'Car.jpg'),
      file: fileAnswer(BY_SA, 'https://evil.example/800px-Car.jpg'),
    });
    expect(await lookupModelPhoto(COROLLA, host.getJson, NOW)).toMatchObject({ status: 'none' });
  });

  it('thumbnails from thumb.wikimedia.org are accepted, without tracking parameters', async () => {
    const t = api({
      title: pageAnswer('Honda XR650L', 'XR.jpg'),
      file: fileAnswer(
        BY_SA,
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d8/XR.jpg/960px-XR.jpg?utm_source=en.wikipedia.org&utm_campaign=imageinfo',
      ),
    });
    const q = { classKey: 'wm1/honda/xr650l', make: 'Honda', model: 'XR650L' };
    expect(await lookupModelPhoto(q, t.getJson, NOW)).toMatchObject({
      status: 'found',
      record: {
        imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d8/XR.jpg/960px-XR.jpg',
      },
    });
  });

  it('a network failure is "unavailable", not "no image"', async () => {
    const r = await lookupModelPhoto(
      COROLLA,
      async () => {
        throw new Error('offline');
      },
      NOW,
    );
    expect(r).toMatchObject({ status: 'unavailable', reason: 'offline' });
  });

  it('image URLs: HTTPS Wikimedia hosts only, tracking parameters dropped', () => {
    expect(wikimediaImageUrl('https://thumb.wikimedia.org/a/b.jpg?utm_source=x')).toBe(
      'https://thumb.wikimedia.org/a/b.jpg',
    );
    expect(wikimediaImageUrl('https://upload.wikimedia.org/a/b.png')).toBe(
      'https://upload.wikimedia.org/a/b.png',
    );
    expect(wikimediaImageUrl('http://upload.wikimedia.org/a/b.png')).toBeNull();
    expect(wikimediaImageUrl('https://upload.wikimedia.org.evil.example/a.png')).toBeNull();
    expect(wikimediaImageUrl('https://evil.example/upload.wikimedia.org/a.png')).toBeNull();
  });

  it('plausibleTitle needs every make and model word', () => {
    expect(plausibleTitle('Hyundai i30 (PD)', { make: 'Hyundai', model: 'I30' })).toBe(true);
    expect(plausibleTitle('Hyundai i20', { make: 'Hyundai', model: 'I30' })).toBe(false);
  });
});
