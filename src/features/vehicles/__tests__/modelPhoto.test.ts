import { migrate, MIGRATIONS, ModelPhotoCacheRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';

import { resolveModelPhoto, type ModelPhotoDeps } from '../modelPhoto';

/**
 * General model photo resolution with the REAL local cache table (sql.js, migration v13) and a
 * fake network (SYNTHETIC API answers). Cache first; "none" remembered for 30 days.
 */

const PAGE = { query: { pages: [{ title: 'Toyota Corolla', pageimage: 'Car.jpg' }] } };
const FILE = {
  query: {
    pages: [
      {
        imageinfo: [
          {
            thumburl: 'https://upload.wikimedia.org/x/800px-Car.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Car.jpg',
            mime: 'image/jpeg',
            extmetadata: {
              License: { value: 'cc-by-sa-4.0' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              Artist: { value: 'Example' },
            },
          },
        ],
      },
    ],
  },
};
const COROLLA = { manufacturer: 'טויוטה', model: 'COROLLA' };

async function setup(answers: { page?: unknown; file?: unknown } = { page: PAGE, file: FILE }) {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, () => '2026-10-03T00:00:00.000Z');
  const repo = new ModelPhotoCacheRepository(db);
  const calls = { json: 0, download: 0 };
  let now = '2026-10-03T12:00:00.000Z';
  let downloadOk = true;
  let fileExists = true;
  const deps: ModelPhotoDeps = {
    cache: repo,
    getJson: async (url) => {
      calls.json += 1;
      if (url.includes('imageinfo')) return answers.file;
      if (url.includes('generator=search')) return { query: { pages: [] } };
      return answers.page ?? { query: { pages: [{ title: 'x', missing: true }] } };
    },
    download: async () => {
      calls.download += 1;
      return downloadOk ? 'file:///app/model-photos/abc.jpg' : null;
    },
    exists: async () => fileExists,
    now: () => now,
  };
  return {
    repo,
    deps,
    calls,
    setNow: (n: string) => (now = n),
    failDownloads: () => (downloadOk = false),
    loseFile: () => (fileExists = false),
  };
}

describe('resolveModelPhoto', () => {
  it('found → downloaded, cached in SQLite by model class; the next view needs no network', async () => {
    const t = await setup();
    const first = await resolveModelPhoto(COROLLA, t.deps);
    expect(first).toMatchObject({
      kind: 'model_photo',
      uri: 'file:///app/model-photos/abc.jpg',
      record: { license: 'CC BY-SA 4.0', classKey: 'wm1/toyota/corolla' },
    });
    expect(await t.repo.get('wm1/toyota/corolla')).toMatchObject({
      status: 'found',
      localUri: 'file:///app/model-photos/abc.jpg',
    });
    const calls = { ...t.calls };
    expect(await resolveModelPhoto(COROLLA, t.deps)).toMatchObject({ kind: 'model_photo' });
    expect(t.calls).toEqual(calls);
  });

  it('nothing suitable → "none" remembered; retried only after 30 days', async () => {
    const t = await setup({});
    expect(await resolveModelPhoto(COROLLA, t.deps)).toEqual({ kind: 'not_found' });
    const after = t.calls.json;
    t.setNow('2026-10-20T12:00:00.000Z');
    expect(await resolveModelPhoto(COROLLA, t.deps)).toEqual({ kind: 'not_found' });
    expect(t.calls.json).toBe(after);
    t.setNow('2026-11-10T12:00:00.000Z');
    await resolveModelPhoto(COROLLA, t.deps);
    expect(t.calls.json).toBeGreaterThan(after);
  });

  it('a failed download is "unavailable" and caches nothing', async () => {
    const t = await setup();
    t.failDownloads();
    expect(await resolveModelPhoto(COROLLA, t.deps)).toEqual({ kind: 'unavailable' });
    expect(await t.repo.get('wm1/toyota/corolla')).toBeNull();
  });

  it('a lost cached file is downloaded again without a new lookup', async () => {
    const t = await setup();
    await resolveModelPhoto(COROLLA, t.deps);
    t.loseFile();
    const json = t.calls.json;
    expect(await resolveModelPhoto(COROLLA, t.deps)).toMatchObject({ kind: 'model_photo' });
    expect(t.calls.json).toBe(json);
    expect(t.calls.download).toBe(2);
  });

  it('an unknown make is never looked up', async () => {
    const t = await setup();
    expect(await resolveModelPhoto({ manufacturer: 'לא ידוע', model: 'X' }, t.deps)).toEqual({
      kind: 'not_found',
    });
    expect(t.calls.json).toBe(0);
  });
});
