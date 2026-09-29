import { fleetCoverage, pct, sampleCoverage, systemBlocker } from '../coverage';
import { fixtureIsraeliSystem, fixtureSystem } from '../registry/testing';
import type { FleetUniverse } from '../registry/universe';

/** M-SOURCE Step 12 — coverage metrics on a SYNTHETIC universe. */
const aliases = { סינתמוטו: 'synthmoto', סינתקאר: 'synthcar', סינתבייק: 'synthbike' };
const universe: FleetUniverse = {
  source: [{ resource: 'synthetic', retrievedAt: '2026-09-30', category: 'car' }],
  totals: { car: 900, motorcycle: 100 },
  makes: [
    { ministryMake: 'סינתמוטו יפן', ministryCode: 1, count: 100, category: 'motorcycle' },
    { ministryMake: 'סינתקאר קוריאה', ministryCode: 2, count: 600, category: 'car' },
    { ministryMake: 'סינתבייק סין', ministryCode: 3, count: 200, category: 'car' },
    { ministryMake: 'לא מוכר', ministryCode: 4, count: 100, category: 'car' },
  ],
};
const systems = [
  // Motorcycle brand: a global library AutoKeep may read automatically.
  fixtureSystem({ sourceSystemId: 'global-synthmoto', manufacturers: ['synthmoto'] }),
  // Car brand: an approved Israeli importer publishing documents, but terms need permission.
  fixtureIsraeliSystem({ sourceSystemId: 'il-synthcar', manufacturers: ['synthcar'] }),
  // Third brand: its importer publishes nothing.
  fixtureIsraeliSystem({
    sourceSystemId: 'il-synthbike',
    manufacturers: ['synthbike'],
    sourceType: 'D_RESTRICTED_OR_UNAVAILABLE',
    discovery: { mechanism: 'none', entryPoints: [] },
  }),
].map((s, i) => (i === 1 ? { ...s, policy: fixtureSystem({}, 'REQUIRES_PERMISSION').policy } : s));

describe('fleet coverage (ceilings over a documented denominator)', () => {
  const c = fleetCoverage(universe, systems, aliases);

  it('uses the full universe as the denominator and never collapses the metrics', () => {
    expect(c.denominator.vehicles).toBe(1000);
    expect(c.documentCeiling).toEqual({ numerator: 100, denominator: 1000 });
    expect(c.israelAuthorityCeiling).toEqual({ numerator: 0, denominator: 1000 });
    expect(c.exactApplicabilityCeiling).toBeNull(); // not computable at fleet level
    expect(c.israeliSourceBlockedByPolicy).toEqual({ numerator: 600, denominator: 1000 });
    expect(c.unmappedVehicles).toEqual({ numerator: 100, denominator: 1000 });
    expect(pct(c.documentCeiling)).toBe(10);
  });

  it('classifies each manufacturer by its deciding standard failure code', () => {
    const by = Object.fromEntries(c.manufacturers.map((m) => [m.manufacturer, m.failure]));
    expect(by).toEqual({
      synthcar: 'PERMISSION_REQUIRED',
      synthbike: 'NO_DIGITAL_SOURCE',
      synthmoto: null,
    });
    expect(c.byFailure).toEqual({ PERMISSION_REQUIRED: 600, NO_DIGITAL_SOURCE: 300 });
  });

  it('is deterministic (same input → identical output)', () => {
    expect(fleetCoverage(universe, systems, aliases)).toEqual(c);
  });

  it('blockers: intrinsic first, then owner approval', () => {
    expect(systemBlocker(fixtureSystem({}, 'UNKNOWN'))).toBe('POLICY_UNKNOWN');
    expect(systemBlocker(fixtureSystem({}, 'NOT_ALLOWED'))).toBe('TERMS_OR_RIGHTS_BLOCK');
    expect(systemBlocker(fixtureSystem({ status: 'proposed' }))).toBe('PERMISSION_REQUIRED');
    expect(
      systemBlocker(
        fixtureSystem({
          sourceType: 'D_RESTRICTED_OR_UNAVAILABLE',
          discovery: { mechanism: 'login', entryPoints: [] },
        }),
      ),
    ).toBe('AUTH_REQUIRED');
    expect(systemBlocker(fixtureSystem())).toBeNull();
  });
});

describe('sample coverage (exact pipeline outcomes)', () => {
  it('counts each metric separately with the sample size as denominator', () => {
    const s = sampleCoverage([
      {
        id: 'a',
        documentRetrieved: true,
        exactApplicability: false,
        scheduled: false,
        israeliAuthority: false,
        failures: ['MODEL_YEAR_NOT_LISTED'],
      },
      {
        id: 'b',
        documentRetrieved: false,
        exactApplicability: false,
        scheduled: false,
        israeliAuthority: false,
        failures: ['POLICY_UNKNOWN', 'POLICY_UNKNOWN'],
      },
    ]);
    expect(s.document).toEqual({ numerator: 1, denominator: 2 });
    expect(s.schedule).toEqual({ numerator: 0, denominator: 2 });
    expect(s.byFailure).toEqual({ MODEL_YEAR_NOT_LISTED: 1, POLICY_UNKNOWN: 1 });
  });
});
