import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { fakeSha256 } from '@/discovery/maintenance/msource/testing';
import { LocalStore, type Clock } from '@/features/data/localStore';
import { MIGRATIONS, MSourceRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

import { ownerReviewState } from '../ownerReview';
import {
  isReadingOwnerDocuments,
  readOwnerDocumentsFor,
  type OwnerDocumentsHost,
  type OwnerDocumentsStore,
} from '../service';

/**
 * Reading the owner's own maintenance documents (owner decision 2026-10-04: AutoKeep never looks
 * for a schedule by itself) through the REAL local store (sql.js). SYNTHETIC booklets.
 */

const DAY = '2026-10-02';
const clock: Clock = {
  now: () => `${DAY}T09:00:00.000Z` as Timestamp,
  today: () => isoDate(DAY) as IsoDate,
};
const FIESTA = '00000000-0000-4000-8000-00000000f001';
const OTHER = '00000000-0000-4000-8000-00000000f003';

const page = (title: string, body: string[]) =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1>${body
    .map((b) => `<p>${b}</p>`)
    .join('')}</body></html>`;

// The owner's own booklet (SYNTHETIC): states the vehicle's engine; two items.
const BOOKLET = page('Ford Fiesta 2013-2017 1.25 Duratec maintenance schedule', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
  'Brake fluid: replace every 24 months.',
]);
// A booklet for a different engine of the same model (SYNTHETIC).
const OTHER_ENGINE_BOOKLET = page('Ford Fiesta 2013-2017 1.6 EcoBoost ST maintenance schedule', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
]);

const host: OwnerDocumentsHost = { sha256: fakeSha256, uploadPdf: null };

async function setup() {
  const db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  await store.addVehicle(
    {
      id: FIESTA,
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      year: 2015,
      registration: '12-345-67',
      odometerKm: 95000,
      odometerMeasuredAt: '2026-10-01',
      archived: false,
    },
    { engine: '1242 סמ״ק', engineCode: 'SNJB', fuel: 'בנזין', firstRegistration: '2015-06' },
  );
  await store.addVehicle(
    {
      id: OTHER,
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FOCUS',
      year: 2018,
      registration: '12-345-68',
      odometerKm: 1000,
      odometerMeasuredAt: '2026-10-01',
      archived: false,
    },
    { engine: '1498 סמ״ק', fuel: 'בנזין' },
  );
  const io: OwnerDocumentsStore = {
    load: (id) => store.ownerDocumentsLoad(id),
    complete: (id, run) => store.ownerDocumentsComplete(id, run),
  };
  const withUpload = (name: string, html: string): OwnerDocumentsStore => ({
    ...io,
    load: async (id) => ({
      ...(await io.load(id))!,
      uploads: [{ id: 'doc-1', name, bytes: new TextEncoder().encode(html) }],
    }),
  });
  return { db, store, io, withUpload };
}

describe("reading the owner's documents (local store, migration v10)", () => {
  it('migration v10 is in the local schema chain', () => {
    expect(MIGRATIONS[9]).toMatchObject({ version: 10, name: 'msource' });
  });

  it('without an uploaded document nothing is read and nothing is scheduled', async () => {
    const { store, io } = await setup();
    expect(await readOwnerDocumentsFor(FIESTA, io, host, clock)).toEqual({
      read: false,
      reason: 'no_documents',
    });
    const plan = (await store.snapshot()).bundles[FIESTA].plan!;
    expect(plan.items).toEqual([]);
  });

  it("the owner's booklet is read on the device; its items wait for the owner's decision", async () => {
    const { db, store, withUpload } = await setup();
    const input = await store.ownerDocumentsLoad(FIESTA);
    expect(input?.input).toMatchObject({
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      engineCode: 'SNJB',
    });
    expect(JSON.stringify(input)).not.toMatch(/12-345-67|1234567/);
    const out = await readOwnerDocumentsFor(
      FIESTA,
      withUpload('booklet.html', BOOKLET),
      host,
      clock,
    );
    expect(out.read).toBe(true);
    const repo = new MSourceRepository(db);
    const run = await repo.latestRun(FIESTA as never);
    // Nothing is resolved automatically.
    expect(run!.schedule!.items).toEqual([]);

    let state = ownerReviewState(run, await repo.ownerDecisions(FIESTA as never));
    expect(state.requirements).toEqual([]);
    expect(state.proposals.map((x) => [x.task, x.intervalKm, x.intervalMonths, x.fit])).toEqual(
      expect.arrayContaining([
        ['engine_oil', 20000, 12, 'matched'],
        ['brake_fluid', null, 24, 'matched'],
      ]),
    );
    const oil = state.proposals.find((x) => x.task === 'engine_oil')!;
    const brake = state.proposals.find((x) => x.task === 'brake_fluid')!;
    expect(oil).toMatchObject({ documentId: 'doc-1', page: expect.any(Number), decision: null });

    await store.decideOwnerProposal(FIESTA, oil.key, 'accepted');
    await store.decideOwnerProposal(FIESTA, brake.key, 'rejected');
    // The same document read again: the decisions still apply (stable keys).
    await readOwnerDocumentsFor(FIESTA, withUpload('booklet.html', BOOKLET), host, clock);
    state = ownerReviewState(
      await repo.latestRun(FIESTA as never),
      await repo.ownerDecisions(FIESTA as never),
    );
    expect(state.requirements).toHaveLength(1);
    expect(state.requirements[0]).toMatchObject({
      task: 'engine_oil',
      authority: 'vehicle_document',
      verification: 'verified',
      extraction: { method: 'deterministic_parser', grounded: true, reviewedBy: 'owner' },
      evidence: [{ documentId: 'doc-1', page: oil.page, authority: 'vehicle_document' }],
    });
    // The accepted item is in the plan; decisions are per vehicle.
    const plan = (await store.snapshot()).bundles[FIESTA].plan!;
    expect(plan.items.map((i) => i.task)).toEqual(['engine_oil']);
    expect((await repo.ownerDecisions(OTHER as never)).size).toBe(0);
  });

  it("an owner's document that states ANOTHER engine is never proposed", async () => {
    const { db, withUpload } = await setup();
    await readOwnerDocumentsFor(
      FIESTA,
      withUpload('other.html', OTHER_ENGINE_BOOKLET),
      host,
      clock,
    );
    const repo = new MSourceRepository(db);
    const state = ownerReviewState(
      await repo.latestRun(FIESTA as never),
      await repo.ownerDecisions(FIESTA as never),
    );
    expect(state.proposals).toEqual([]);
  });

  it('an upload made while a reading is in progress is read by one follow-up reading', async () => {
    const { db, io } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let loads = 0;
    const booklet = new TextEncoder().encode(BOOKLET);
    const store: OwnerDocumentsStore = {
      ...io,
      load: async (id) => {
        loads += 1;
        const base = (await io.load(id))!;
        if (loads === 1) {
          await gate; // the first reading is still loading when the owner uploads
          return { ...base, uploads: [{ id: 'doc-0', name: 'first.html', bytes: booklet }] };
        }
        return { ...base, uploads: [{ id: 'doc-late', name: 'late.html', bytes: booklet }] };
      },
    };
    const first = readOwnerDocumentsFor(FIESTA, store, host, clock);
    // The owner uploads now: this request is queued, not dropped.
    expect(await readOwnerDocumentsFor(FIESTA, store, host, clock)).toEqual({
      read: false,
      reason: 'already_running',
    });
    release();
    await first;
    for (let i = 0; i < 200 && (loads < 2 || isReadingOwnerDocuments(FIESTA)); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(loads).toBe(2);
    const run = await new MSourceRepository(db).latestRun(FIESTA as never);
    expect(run?.candidates.map((c) => c.candidate.upload?.name)).toEqual(['late.html']);
  });
});
