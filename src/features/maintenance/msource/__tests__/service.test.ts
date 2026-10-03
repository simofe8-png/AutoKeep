import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { ALLOW_ALL, FakeWeb } from '@/discovery/maintenance/msource/testing';
import { LocalStore, type Clock } from '@/features/data/localStore';
import { MIGRATIONS, MSourceRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

import { catalogFor } from '../catalog';
import { ownerReviewState } from '../ownerReview';
import {
  isDiscoveryRunning,
  startMaintenanceDiscovery,
  type DiscoveryStore,
  type MSourceHost,
} from '../service';

/**
 * M-SOURCE application service through the REAL local store (sql.js) and the same runner as the
 * worker host. SYNTHETIC web fixtures (fictional publishers, invented test intervals).
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

// Engine-scoped (ENGINE_FAMILY): the title states the 1.25 Duratec engine.
const A = page('Ford Fiesta 2013-2017 1.25 Duratec maintenance schedule', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
]);
// The owner's own booklet (SYNTHETIC): states the vehicle's engine; two items.
const BOOKLET = page('Ford Fiesta 2013-2017 1.25 Duratec maintenance schedule', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
  'Brake fluid: replace every 24 months.',
]);
// A booklet for a different engine of the same model (SYNTHETIC).
const OTHER_ENGINE_BOOKLET = page('Ford Fiesta 2013-2017 1.6 EcoBoost ST maintenance schedule', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
]);
// Explicitly all-engine (ALL_ENGINES).
const B = page('Ford Fiesta Mk7 (2013-2017) service intervals for all engines', [
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
]);

function host(web: FakeWeb, known: string[] = []): MSourceHost {
  return {
    net: web.net(),
    sha256: async (b) => {
      let h = 0x811c9dc5;
      for (const x of b) h = Math.imul(h ^ x, 0x01000193) >>> 0;
      return h.toString(16).padStart(8, '0').repeat(8);
    },
    registry: [],
    catalog: () => [],
    research: {
      id: 'recorded-test-research',
      research: async () => ({
        candidates: known.map((url) => ({
          url,
          sourceType: 'independent_database',
          documentFormat: 'html',
        })),
      }),
    },
  };
}

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
  const io: DiscoveryStore = {
    load: (id) => store.msourceLoad(id),
    progress: (id, run, key, status) => store.msourceProgress(id, run, key, status),
    complete: (id, run, status, reqs, cache) => store.msourceComplete(id, run, status, reqs, cache),
  };
  return { db, store, io };
}

const WEB = {
  'https://www.example-garage.com/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
  'https://www.example-autodata.org/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
  'https://www.example-garage.com/fiesta': { body: A },
  'https://www.example-autodata.org/fiesta-mk7': { body: B },
};
const URLS = [
  'https://www.example-garage.com/fiesta',
  'https://www.example-autodata.org/fiesta-mk7',
];

describe('M-SOURCE application service (local store, migration v10)', () => {
  it('migration v10 is in the local schema chain', () => {
    expect(MIGRATIONS[9]).toMatchObject({ version: 10, name: 'msource' });
  });

  it('start → progress → READY persisted; the plan schedules the evidence-backed item', async () => {
    const { db, store, io } = await setup();
    const states: string[] = [];
    const tracking: DiscoveryStore = {
      ...io,
      progress: async (id, run, key, status) => {
        states.push(status.state);
        await io.progress(id, run, key, status);
      },
    };
    const web = new FakeWeb(WEB);
    const out = await startMaintenanceDiscovery(FIESTA, tracking, host(web, URLS), clock);
    expect(out).toMatchObject({ started: true, status: { state: 'READY', partial: false } });
    expect(states[0]).toBe('IDENTIFYING_VEHICLE');
    expect(states).toEqual(
      expect.arrayContaining([
        'DISCOVERING_SOURCES',
        'FOUND_SOURCES',
        'VERIFYING_MATCH',
        'BUILDING_SCHEDULE',
      ]),
    );
    const repo = new MSourceRepository(db);
    expect((await repo.latestStatus(FIESTA as never))?.state).toBe('READY');
    const stored = await repo.schedule(FIESTA as never);
    expect(stored?.schedule.items.map((i) => [i.task, i.intervalKm, i.intervalMonths])).toEqual([
      ['engine_oil', 20000, 12],
    ]);
    // The maintenance plan picks the requirement up (level T, two independent sources).
    const vehicles = (await store.snapshot()).vehicles;
    const v = vehicles.find((x) => x.id === FIESTA)!;
    expect(v).toBeTruthy();
    const plan = (await store.snapshot()).bundles[FIESTA].plan!;
    const oil = plan.items.find((i) => i.task === 'engine_oil');
    // Two agreeing sources with sufficient engine scopes (ENGINE_FAMILY + ALL_ENGINES) → STRONG.
    expect(oil).toMatchObject({ level: 'T', confidence: 'high', corroboratingSources: 2 });
    expect(oil?.nextKm).toBeGreaterThan(95000);
    expect(oil?.nextDate).toBeTruthy();
    expect(plan.discovery).toMatchObject({ state: 'READY' });
    // Zero cross-vehicle leakage: the other vehicle got nothing from this run.
    const other = (await store.snapshot()).bundles[OTHER].plan!;
    expect(other.items.some((i) => i.task === 'engine_oil')).toBe(false);
    expect(other.discovery ?? null).toBeNull();
  });

  it('a second run for the same class reuses cached structured results (no re-download)', async () => {
    const { io } = await setup();
    const first = new FakeWeb(WEB);
    await startMaintenanceDiscovery(FIESTA, io, host(first, URLS), clock);
    const second = new FakeWeb(WEB);
    const out = await startMaintenanceDiscovery(FIESTA, io, host(second, URLS), clock);
    expect(out).toMatchObject({ started: true, status: { state: 'READY' } });
    expect(second.requested.filter((u) => !u.endsWith('/robots.txt'))).toEqual([]);
  });

  it('no evidence → NO_SOURCE_FOUND with retry + upload; nothing is scheduled', async () => {
    const { store, io } = await setup();
    const out = await startMaintenanceDiscovery(FIESTA, io, host(new FakeWeb({}), []), clock);
    expect(out).toMatchObject({
      started: true,
      status: { state: 'NO_SOURCE_FOUND', retryAvailable: true, uploadDocumentAvailable: true },
    });
    const plan = (await store.snapshot()).bundles[FIESTA].plan!;
    expect(plan.items.some((i) => i.task === 'engine_oil')).toBe(false);
  });

  it("the owner's uploaded document enters the same pipeline, held for owner review", async () => {
    const { db, store, io } = await setup();
    const input = await store.msourceLoad(FIESTA);
    expect(input?.input).toMatchObject({
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      engineCode: 'SNJB',
    });
    expect(JSON.stringify(input)).not.toMatch(/12-345-67|1234567/);
    const web = new FakeWeb(WEB);
    const withUpload = (bytes: Uint8Array): DiscoveryStore => ({
      ...io,
      load: async (id) => ({
        ...(await io.load(id))!,
        uploads: [{ id: 'doc-1', name: 'booklet.html', bytes }],
      }),
    });
    const booklet = new TextEncoder().encode(BOOKLET);
    const out = await startMaintenanceDiscovery(FIESTA, withUpload(booklet), host(web), clock);
    expect(web.requested.some((u) => u.startsWith('upload:'))).toBe(false);
    // Held: the upload alone never produces a schedule item before the owner reviews it.
    expect(out).toMatchObject({ started: true, status: { state: 'INSUFFICIENT_EVIDENCE' } });
    const repo = new MSourceRepository(db);
    const run = await repo.latestRun(FIESTA as never);
    const up = run!.schedule!.sources.find((s) => s.sourceType === 'user_upload');
    expect(up?.access.map((a) => a.reason)).toEqual(expect.arrayContaining(['user_provided']));
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
    await startMaintenanceDiscovery(FIESTA, withUpload(booklet), host(web), clock);
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
    expect(state.requirements[0].evidence[0].documentSha256).toMatch(/^[0-9a-f]{64}$/);
    // Decisions are per vehicle: nothing leaks to another vehicle.
    expect((await repo.ownerDecisions(OTHER as never)).size).toBe(0);
  });

  it("an owner's document that states ANOTHER engine is never proposed", async () => {
    const { db, io } = await setup();
    const other = new TextEncoder().encode(OTHER_ENGINE_BOOKLET);
    const store: DiscoveryStore = {
      ...io,
      load: async (id) => ({
        ...(await io.load(id))!,
        uploads: [{ id: 'doc-2', name: 'other.html', bytes: other }],
      }),
    };
    await startMaintenanceDiscovery(FIESTA, store, host(new FakeWeb(WEB)), clock);
    const repo = new MSourceRepository(db);
    const state = ownerReviewState(
      await repo.latestRun(FIESTA as never),
      await repo.ownerDecisions(FIESTA as never),
    );
    expect(state.proposals).toEqual([]);
  });

  it('phone path: the bundled worker catalog is reused offline and reproduces the factual result', async () => {
    const { io } = await setup();
    const offline = new FakeWeb({});
    const out = await startMaintenanceDiscovery(
      FIESTA,
      io,
      { ...host(offline), research: null, catalog: catalogFor },
      clock,
    );
    // No document was downloaded: every catalog source was answered from the cache.
    expect(offline.requested.filter((u) => !u.endsWith('/robots.txt'))).toEqual([]);
    expect(out).toMatchObject({ started: true, status: { state: 'READY', partial: true } });
  });

  it('an upload made while a run is in progress is processed by one follow-up run (never lost)', async () => {
    const { db, io } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let loads = 0;
    const booklet = new TextEncoder().encode(BOOKLET);
    const store: DiscoveryStore = {
      ...io,
      load: async (id) => {
        loads += 1;
        const base = (await io.load(id))!;
        if (loads === 1) {
          await gate; // the first run is still loading when the owner uploads
          return base;
        }
        return { ...base, uploads: [{ id: 'doc-late', name: 'late.html', bytes: booklet }] };
      },
    };
    const web = new FakeWeb(WEB);
    const first = startMaintenanceDiscovery(FIESTA, store, host(web), clock);
    // The owner uploads now: this start is queued, not dropped.
    expect(await startMaintenanceDiscovery(FIESTA, store, host(web), clock)).toEqual({
      started: false,
      reason: 'already_running',
    });
    release();
    await first;
    for (let i = 0; i < 200 && (loads < 2 || isDiscoveryRunning(FIESTA)); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(loads).toBe(2);
    const repo = new MSourceRepository(db);
    const state = ownerReviewState(
      await repo.latestRun(FIESTA as never),
      await repo.ownerDecisions(FIESTA as never),
    );
    expect(state.proposals.map((x) => x.task)).toEqual(
      expect.arrayContaining(['engine_oil', 'brake_fluid']),
    );
  });
});
