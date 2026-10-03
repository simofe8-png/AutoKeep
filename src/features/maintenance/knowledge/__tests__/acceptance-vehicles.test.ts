import { isoDate, isVerifiedRequirement, type IsoDate } from '@/domain';

import { KNOWN_SOURCES, knownRequirements } from '../knownSources';
import {
  buildMaintenancePlan,
  factsOf,
  officialSources,
  taskCompletionId,
  type PlanVehicle,
} from '../plan';

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

  it('the unreviewed UK-manual candidate schedules nothing: booklet request + awaiting verification', () => {
    const p = plan(ibiza);
    expect(p.items).toEqual([]);
    expect(p.status).toBe('needs_information');
    expect(p.requests).toEqual([
      {
        kind: 'official_source',
        sources: [
          expect.objectContaining({
            sourceSystemId: 'il-champion-service-routine',
            reason: 'permission_required',
            israeli: true,
            publishesSchedule: true,
          }),
        ],
      },
      { kind: 'upload_booklet', hint: 'service_plan_code' },
      {
        kind: 'awaiting_verification',
        sources: [{ title: "SEAT Ibiza owner's manual (UK English)", publishedOn: undefined }],
      },
    ]);
    // Level E (unreviewed extraction): considered, never applied.
    const ps = p.unresolved.find((r) => r.task === 'periodic_service');
    expect(ps).toMatchObject({ status: 'unverified_only' });
  });

  it('once reviewed, the UK rule is level B (market not proven) and still needs the regime code', () => {
    const reviewed = knownRequirements().map((r) =>
      r.id.startsWith('seat-ibiza-my12-uk')
        ? {
            ...r,
            verification: 'verified' as const,
            extraction: { ...r.extraction, reviewedBy: 'test-curator' },
          }
        : r,
    );
    const input = { profile: null, requirements: reviewed, history: [], readings: [], today };
    const unknown = buildMaintenancePlan({ vehicle: ibiza, ...input });
    expect(unknown.items).toEqual([]);
    // The options are the codes the source itself names — not a fixed list of one make's codes.
    expect(unknown.requests).toContainEqual({
      kind: 'service_regime',
      hint: 'service_plan_code',
      codes: ['QG0', 'QG2'],
    });
    const qg0 = buildMaintenancePlan({
      vehicle: ibiza,
      ...input,
      profile: { inServiceDate: null, serviceRegime: 'QG0', usage: null },
    });
    const ps = qg0.items.find((i) => i.task === 'periodic_service');
    expect(ps).toMatchObject({ level: 'B' });
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
      hint: 'service_plan_code',
      codes: ['QG0', 'QG2'],
    });
  });
});

describe('Case B — Ford Fiesta 2015 / 1.25 / SNJB', () => {
  it('the importer rule was found but awaits verification: nothing is scheduled from it', () => {
    const p = plan(fiesta);
    expect(p.items).toEqual([]);
    expect(p.requests).toEqual([
      // Delek's Ford system is identified but not yet approved as an authority: said precisely.
      { kind: 'official_source_pending' },
      { kind: 'upload_booklet', hint: 'generic' },
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

describe('fallback: the precise reason per official source (registry data, nothing fetched)', () => {
  const vehicle = (manufacturer: string, model: string, year: number): PlanVehicle => ({
    ...ibiza,
    id: `veh-${model}`,
    manufacturer,
    model,
    year,
    engineCode: undefined,
  });
  const reasons = (v: PlanVehicle) =>
    officialSources(factsOf(v, null)).map((x) => [x.sourceSystemId, x.reason, x.url]);

  it('Hyundai: the Israeli importer requires written permission; its official page is offered', () => {
    const h = vehicle('יונדאי קוריאה', 'i20', 2016);
    expect(reasons(h)).toEqual([
      [
        'il-colmobil-hyundai',
        'permission_required',
        'https://www.hyundaimotors.co.il/maintenance/',
      ],
    ]);
    const p = buildMaintenancePlan({
      vehicle: h,
      profile: null,
      requirements: [],
      history: [],
      readings: [],
      today,
    });
    expect(p.requests[0]).toMatchObject({
      kind: 'official_source',
      sources: [{ reason: 'permission_required' }],
    });
  });

  it('Toyota: an Israeli direct schedule whose access policy is unresolved', () => {
    expect(reasons(vehicle('טויוטה טורקיה', 'C-HR', 2019))[0]).toEqual([
      'il-union-motors-toyota',
      'access_policy_unresolved',
      expect.stringMatching(/^https:\/\/(www\.)?toyota\.co\.il\//),
    ]);
  });

  it('Mazda: the importer plans sit behind a login — manual access required', () => {
    expect(reasons(vehicle('מזדה יפן', '3', 2011))[0].slice(0, 2)).toEqual([
      'il-delek-mazda',
      'manual_access_required',
    ]);
  });

  it('proposed (unapproved) systems are never offered; an unknown make says so', () => {
    const tesla = officialSources(factsOf(vehicle('טסלה סין', 'MODEL 3', 2022), null));
    expect(tesla.every((x) => x.sourceSystemId.length > 0)).toBe(true);
    expect(tesla).toEqual([]);
    const p = buildMaintenancePlan({
      vehicle: vehicle('טסלה סין', 'MODEL 3', 2022),
      profile: null,
      requirements: [],
      history: [],
      readings: [],
      today,
    });
    // Tesla's system is identified but not approved: "pending", never "not found".
    expect(p.requests).toContainEqual({ kind: 'official_source_pending' });
    const unknown = buildMaintenancePlan({
      vehicle: vehicle('יצרן לא מוכר', 'X', 2020),
      profile: null,
      requirements: [],
      history: [],
      readings: [],
      today,
    });
    expect(unknown.requests).toContainEqual({ kind: 'no_official_source' });
  });
});

describe('engine code is first-class (M-SOURCE Step 9)', () => {
  it('the engine code comes from the registry only — never derived from the displacement', () => {
    const facts = factsOf(
      {
        id: 'v',
        kind: 'car',
        manufacturer: "סקודה צ'כיה",
        model: 'OCTAVIA',
        year: 2018,
        engine: '1395 סמ״ק',
        fuel: 'בנזין',
      },
      null,
    );
    expect(facts.displacementCc).toBe(1395);
    expect(facts.engineCode).toBeUndefined();
    const withCode = factsOf(
      {
        id: 'v',
        kind: 'car',
        manufacturer: "סקודה צ'כיה",
        model: 'OCTAVIA',
        year: 2018,
        engine: '1395 סמ״ק',
        engineCode: 'CZDA',
      },
      null,
    );
    expect(withCode.engineCode).toBe('CZDA');
  });
});
