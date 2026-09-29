import { isoDate, isVerifiedRequirement, type IsoDate } from '@/domain';

import { KNOWN_SOURCES, knownRequirements } from '../knownSources';
import { buildMaintenancePlan, factsOf, taskCompletionId, type PlanVehicle } from '../plan';

/**
 * Task 7: the two REAL acceptance vehicles against the REAL sources found (knownSources.ts).
 * PASS = the system knows exactly which evidence is missing and fabricates nothing.
 */
const today = isoDate('2026-09-29') as IsoDate;
const plan = (vehicle: PlanVehicle) =>
  buildMaintenancePlan({
    vehicle,
    profile: { inServiceDate: isoDate('2012-01-01') as IsoDate, serviceRegime: null, usage: null },
    requirements: knownRequirements(),
    history: [],
    readings: [{ date: today, km: 100000 }],
    today,
  });

const ibiza: PlanVehicle = {
  id: 'veh-ibiza',
  kind: 'car',
  manufacturer: 'סיאט ספרד',
  model: 'IBIZA',
  year: 2012,
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
};
const fiesta: PlanVehicle = {
  id: 'veh-fiesta',
  kind: 'car',
  manufacturer: 'פורד גרמניה',
  model: 'FIESTA',
  year: 2015,
  engine: '1242 סמ״ק',
  engineCode: 'SNJB',
  fuel: 'בנזין',
};

describe('real sources are recorded with location and access, and none is self-verified', () => {
  it('every known claim is an unreviewed candidate located on its page / section', () => {
    for (const r of knownRequirements()) {
      expect(r.verification).toBe('candidate');
      expect(isVerifiedRequirement(r)).toBe(false);
      expect(r.evidence[0].page ?? r.evidence[0].section).toBeTruthy();
      expect(r.evidence[0].excerpt).toBeUndefined(); // no manual text is stored
    }
    expect(KNOWN_SOURCES.map((s) => s.access)).toEqual(['public', 'public']);
  });
});

describe('Case A — SEAT Ibiza 2012 / CGG', () => {
  it('facts: make, model, year, engine code, IL market, in-service date — regime unknown', () => {
    expect(factsOf(ibiza, null)).toMatchObject({
      make: 'seat',
      modelYear: 2012,
      engineCode: 'CGG',
      displacementCc: 1390,
      powertrain: 'petrol',
      market: 'IL',
    });
  });

  it('the UK owner’s manual does not cover an Israeli vehicle: no schedule, exact booklet request', () => {
    const p = plan(ibiza);
    expect(p.items).toEqual([]);
    expect(p.status).toBe('needs_information');
    expect(p.requests).toEqual([{ kind: 'upload_booklet', hint: 'seat_maintenance_programme' }]);
    // The UK claim was considered and excluded on the market, not silently applied.
    const ps = p.unresolved.find((r) => r.task === 'periodic_service');
    expect(ps).toBeUndefined();
  });

  it('even an Israeli-market copy of the same rule would still ask for the regime code', () => {
    const il = knownRequirements().map((r) =>
      r.id === 'seat-ibiza-my12-uk-fixed-service'
        ? {
            ...r,
            verification: 'verified' as const,
            extraction: { ...r.extraction, reviewedBy: 'test-curator' },
            applicability: { ...r.applicability, markets: ['IL'] },
          }
        : r,
    );
    const p = buildMaintenancePlan({
      vehicle: ibiza,
      profile: null,
      requirements: il,
      history: [],
      readings: [],
      today,
    });
    expect(p.items).toEqual([]);
    expect(p.requests).toContainEqual({
      kind: 'service_regime',
      hint: 'seat_maintenance_programme',
    });
  });
});

describe('Case B — Ford Fiesta 2015 / 1.25 / SNJB', () => {
  it('the importer rule was found but awaits verification: nothing is scheduled from it', () => {
    const p = plan(fiesta);
    expect(p.items).toEqual([]);
    expect(p.requests).toEqual([
      { kind: 'upload_booklet', hint: 'ford_service_plan' },
      {
        kind: 'awaiting_verification',
        sources: [{ title: 'ford.co.il — תוכנית טיפול', publishedOn: '2024-11-24' }],
      },
    ]);
  });

  it('a completion link is specific to one task on one vehicle', () => {
    const a = taskCompletionId('veh-fiesta', 'periodic_service');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).toBe(taskCompletionId('veh-fiesta', 'periodic_service'));
    expect(a).not.toBe(taskCompletionId('veh-ibiza', 'periodic_service'));
    expect(a).not.toBe(taskCompletionId('veh-fiesta', 'engine_oil'));
  });
});
