import { isoDate, type IsoDate, type MaintenanceRequirement, type Timestamp } from '@/domain';
import { migrate, MIGRATIONS, DiscoveryMissRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';

import { buildMaintenancePlan, vehicleClassKey, type PlanVehicle } from '../plan';

/** §24 — explicit fallback when no reliable schedule can be built (SYNTHETIC requirements). */
const today = isoDate('2026-09-30') as IsoDate;
const vehicle: PlanVehicle = {
  id: 'veh-synthetic-1',
  kind: 'car',
  manufacturer: 'Synthcar',
  model: 'Alpha',
  year: 2019,
};
const req = (over: Partial<MaintenanceRequirement>): MaintenanceRequirement => ({
  id: 'synthetic-req',
  task: 'engine_oil',
  action: 'replacement',
  interval: { every: { value: 15000, unit: 'km' }, rule: 'distance_only', repeats: true },
  applicability: { makes: ['synthcar'], models: ['alpha'] },
  authority: 'manufacturer',
  evidence: [
    {
      documentId: 'd',
      documentTitle: 'SYNTHETIC',
      authority: 'manufacturer',
      markets: ['IL'],
      page: 1,
      documentSha256: 'a'.repeat(64),
    },
  ],
  verification: 'verified',
  extraction: { method: 'curated', by: 'test', at: today },
  ...over,
});
const build = (requirements: MaintenanceRequirement[]) =>
  buildMaintenancePlan({
    vehicle,
    profile: null,
    requirements,
    history: [],
    readings: [{ date: today, km: 50000 }],
    today,
  });

describe('§24 user fallback', () => {
  it('no evidence at all → no schedule, the fallback with recorded reasons and the upload action', () => {
    const p = build([]);
    expect(p.items).toEqual([]);
    expect(p.status).toBe('needs_information');
    expect(p.fallback).toEqual({
      reasons: ['no_official_source'],
      classKey: 'car|synthcar|alpha|2019',
    });
    expect(p.requests).toContainEqual({ kind: 'upload_booklet', hint: 'generic' });
  });

  it('evidence that does not resolve for the vehicle is a miss with the precise reason', () => {
    const p = build([req({ applicability: { engineCodes: ['SYN1'] } })]);
    expect(p.items).toEqual([]);
    expect(p.fallback?.reasons).toContain('missing_vehicle_fact');
  });

  it('useful partial evidence → a PARTIAL schedule, no fallback', () => {
    const p = build([
      req({}),
      req({ id: 'synthetic-2', task: 'spark_plugs', applicability: { engineCodes: ['SYN1'] } }),
    ]);
    expect(p.items.map((i) => i.task)).toEqual(['engine_oil']);
    expect(p.status).toBe('partial');
    expect(p.fallback).toBeNull();
  });

  it('a complete verified schedule → ready, no fallback', () => {
    const p = build([req({})]);
    expect(p.status).toBe('ready');
    expect(p.fallback).toBeNull();
  });

  it('the class key never carries the vehicle id, plate or VIN', () => {
    const key = vehicleClassKey(build([]).facts);
    expect(key).not.toContain(vehicle.id);
    expect(vehicleClassKey({ kind: 'car', market: 'IL', engineCode: 'CGG' })).toBe('car|?|?|?|CGG');
  });

  it('misses are stored once per class + reasons (first / last seen)', async () => {
    const db = await openTestDatabase();
    await migrate(db, MIGRATIONS, () => '2026-09-30T00:00:00.000Z' as Timestamp);
    const repo = new DiscoveryMissRepository(db);
    await repo.record(
      'car|synthcar|alpha|2019',
      ['b', 'a'],
      '2026-09-30T01:00:00.000Z' as Timestamp,
    );
    await repo.record(
      'car|synthcar|alpha|2019',
      ['a', 'b'],
      '2026-09-30T02:00:00.000Z' as Timestamp,
    );
    expect(await repo.all()).toEqual([
      {
        classKey: 'car|synthcar|alpha|2019',
        reasons: ['a', 'b'],
        firstSeenAt: '2026-09-30T01:00:00.000Z',
        lastSeenAt: '2026-09-30T02:00:00.000Z',
      },
    ]);
  });
});
