/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MANUFACTURER_ALIASES } from '@/discovery/registry';

import { ADAPTER_IDS } from '../../adapters';
import { currentPolicy, POLICY_DIMENSIONS } from '../policy';
import { SOURCE_SYSTEMS } from '../israelSources';
import { assertValidRegistry } from '../sourceSystem';
import { candidateSystems, fleetByManufacturer, makeKeyOf, type FleetUniverse } from '../universe';

/** M-SOURCE Steps 4–5 — the real Israeli registry and the Ministry fleet universe mapping. */
const universe = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../docs/maintenance/data/fleet_universe_2026-09-30.json'),
    'utf8',
  ),
) as FleetUniverse;

describe('Step 4 — the Israeli source registry', () => {
  it('every record is valid and coherent', () => {
    expect(() => assertValidRegistry(SOURCE_SYSTEMS, ADAPTER_IDS)).not.toThrow();
    expect(SOURCE_SYSTEMS.length).toBeGreaterThanOrEqual(40);
  });

  it('no invented permission: ALLOWED only where a recorded owner decision grants it', () => {
    for (const s of SOURCE_SYSTEMS) {
      const p = currentPolicy(s.policy);
      for (const d of POLICY_DIMENSIONS) {
        if (p.dimensions[d].value !== 'ALLOWED') continue;
        const kinds = p.dimensions[d].basis.map((id) => p.evidence.find((e) => e.id === id)?.kind);
        expect({ id: s.sourceSystemId, d, kinds }).toEqual({
          id: s.sourceSystemId,
          d,
          kinds: ['owner_decision'],
        });
      }
    }
    const allowed = SOURCE_SYSTEMS.filter((s) =>
      POLICY_DIMENSIONS.some((d) => currentPolicy(s.policy).dimensions[d].value === 'ALLOWED'),
    ).map((s) => s.sourceSystemId);
    expect(allowed).toEqual(['global-sym-global']);
  });

  it('access re-review (2026-09-30) is append-only: v1 kept, only UNKNOWN tightened, nothing loosened', () => {
    const rank = { ALLOWED: 0, UNKNOWN: 1, REQUIRES_PERMISSION: 2, NOT_ALLOWED: 3 } as const;
    const revised = SOURCE_SYSTEMS.filter((s) => s.policy.versions.length > 1);
    expect(revised.length).toBe(13);
    for (const s of revised) {
      const [v1, v2] = s.policy.versions;
      expect([v1.version, v2.version]).toEqual([1, 2]);
      expect(v2.evidence.slice(0, v1.evidence.length)).toEqual(v1.evidence);
      for (const d of POLICY_DIMENSIONS) {
        const a = v1.dimensions[d].value;
        const b = v2.dimensions[d].value;
        expect(rank[b]).toBeGreaterThanOrEqual(rank[a]);
        if (a !== b) {
          expect(a).toBe('UNKNOWN');
          const ev = v2.evidence.filter((e) => v2.dimensions[d].basis.includes(e.id));
          expect(ev.every((e) => e.url && e.quote)).toBe(true);
        }
      }
    }
  });

  it('Israeli systems are importers of market IL; approval only for owner-approved domains', () => {
    const P1 = [
      'toyota.co.il',
      'mazda.co.il',
      'hyundaimotors.co.il',
      'colmobil.co.il',
      'kia-israel.co.il',
      'skoda.co.il',
      'vw.co.il',
      'vwcv.co.il',
      'championmotors.co.il',
      'champ.co.il',
      'suzuki.co.il',
      'oferavnir.co.il',
      'honda.co.il',
      'hondacars.co.il',
      'mct.co.il',
      'hondabike.co.il',
      'yamaha-motor.co.il',
      'metro.co.il',
      'kawasaki.co.il',
      'sanyang.co.il',
      'sym-global.com',
    ];
    for (const s of SOURCE_SYSTEMS) {
      if (s.origin === 'israeli')
        expect([s.market, s.authorityClass, !!s.importer]).toEqual(['IL', 'importer', true]);
      if (s.status === 'approved') expect(s.domains.some((d) => P1.includes(d.host))).toBe(true);
    }
  });

  it('no shared CDN is an authority host', () => {
    for (const s of SOURCE_SYSTEMS) {
      for (const d of s.domains)
        expect(d.host).not.toMatch(/cloudinary|azureedge|sharepoint|amazonaws|cloudfront/);
    }
  });

  it('source types are all four kinds, and restricted systems have no retrieval adapter', () => {
    const types = new Set(SOURCE_SYSTEMS.map((s) => s.sourceType));
    expect([...types].sort()).toEqual([
      'A_DIRECT_MAINTENANCE_SCHEDULE',
      'B_DIGITAL_MANUAL',
      'C_STRUCTURED_WEB_MANUAL',
      'D_RESTRICTED_OR_UNAVAILABLE',
    ]);
    for (const s of SOURCE_SYSTEMS.filter((x) => x.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE')) {
      expect(s.discovery.entryPoints).toEqual([]);
    }
  });
});

describe('Step 5 — Ministry fleet universe → source-system candidates', () => {
  it('the universe is aggregate counts that sum to the dataset totals (no personal fields)', () => {
    const sum = (c: 'car' | 'motorcycle') =>
      universe.makes.filter((m) => m.category === c).reduce((a, m) => a + m.count, 0);
    expect(sum('car')).toBe(universe.totals.car);
    expect(sum('motorcycle')).toBe(universe.totals.motorcycle);
    expect(Object.keys(universe.makes[0]).sort()).toEqual([
      'category',
      'count',
      'ministryCode',
      'ministryMake',
    ]);
  });

  it('Ministry make strings map deterministically to manufacturer keys; unknown stays unmapped', () => {
    expect(makeKeyOf('טויוטה טורקיה', MANUFACTURER_ALIASES)).toBe('toyota');
    expect(makeKeyOf('פולקסווגן-ספרד', MANUFACTURER_ALIASES)).toBe('volkswagen');
    expect(makeKeyOf('קיה ד. קוריאה', MANUFACTURER_ALIASES)).toBe('kia');
    expect(makeKeyOf('מ.ג סין', MANUFACTURER_ALIASES)).toBe('mg');
    expect(makeKeyOf('סאן יאנג טאיוו', MANUFACTURER_ALIASES)).toBe('sym');
    expect(makeKeyOf('קואנג יאנג טאי', MANUFACTURER_ALIASES)).toBe('kymco');
    expect(makeKeyOf('יצרן לא מוכר', MANUFACTURER_ALIASES)).toBeNull();
  });

  it('candidates follow the runtime source priority, deterministically', () => {
    const toyota = candidateSystems(
      { make: 'טויוטה טורקיה' },
      SOURCE_SYSTEMS,
      MANUFACTURER_ALIASES,
    );
    expect(toyota.map((c) => [c.system.sourceSystemId, c.priority])).toEqual([
      ['il-union-motors-toyota', 2],
      ['global-toyota-europe-owners-manuals', 5],
    ]);
    const sym = candidateSystems({ make: 'סאן יאנג טאיוו' }, SOURCE_SYSTEMS, MANUFACTURER_ALIASES);
    expect(sym.map((c) => c.system.sourceSystemId)).toEqual([
      'global-sym-global',
      'il-metro-motor',
    ]);
    expect(
      candidateSystems({ make: 'יצרן לא מוכר' }, SOURCE_SYSTEMS, MANUFACTURER_ALIASES),
    ).toEqual([]);
  });

  it('a car importer never answers for a two-wheeler of the same brand, and vice versa', () => {
    const car = candidateSystems(
      { make: 'סוזוקי יפן', kind: 'car' },
      SOURCE_SYSTEMS,
      MANUFACTURER_ALIASES,
    );
    const moto = candidateSystems(
      { make: 'סוזוקי יפן', kind: 'motorcycle' },
      SOURCE_SYSTEMS,
      MANUFACTURER_ALIASES,
    );
    expect(car.map((c) => c.system.sourceSystemId)).not.toContain('il-ofer-avnir');
    expect(moto.map((c) => c.system.sourceSystemId)).toContain('il-ofer-avnir');
    expect(moto.every((c) => c.system.vehicleKinds.includes('motorcycle'))).toBe(true);
  });

  it('a parallel import is flagged: the official importer system may not cover it', () => {
    const official = candidateSystems(
      { make: 'טויוטה יפן', importer: 'יוניון מוטורס בע"מ' },
      SOURCE_SYSTEMS,
      MANUFACTURER_ALIASES,
    );
    expect(official[0].importerMatch).toBe('same');
    const parallel = candidateSystems(
      { make: 'טויוטה יפן', importer: 'טרגט מוטורס' },
      SOURCE_SYSTEMS,
      MANUFACTURER_ALIASES,
    );
    expect(parallel[0].importerMatch).toBe('different');
  });

  it('the fleet groups by manufacturer; unmapped makes are listed, never guessed', () => {
    const { mapped, unmapped } = fleetByManufacturer(universe, MANUFACTURER_ALIASES);
    expect(mapped.get('toyota|car')!.makes).toEqual(
      expect.arrayContaining(['טויוטה יפן', 'טויוטה טורקיה']),
    );
    expect(mapped.get('honda|motorcycle')!.makes).toEqual(expect.arrayContaining(['הונדה יפן']));
    const mappedShare =
      [...mapped.values()].reduce((a, m) => a + m.count, 0) /
      (universe.totals.car + universe.totals.motorcycle);
    expect(mappedShare).toBeGreaterThan(0.95);
    expect(unmapped.length).toBeGreaterThan(0);
  });
});
