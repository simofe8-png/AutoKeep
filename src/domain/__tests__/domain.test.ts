import {
  addMonths,
  archiveVehicle,
  asId,
  confirmServiceDraft,
  createAlert,
  createDocument,
  createGarageRecommendation,
  createLocalProfile,
  createOdometerReading,
  createSchedule,
  createVehicle,
  daysBetween,
  decideVerification,
  displayState,
  formatRegistration,
  isoDate,
  latestReading,
  maskVin,
  outOfScope,
  parseIsoDate,
  parseRegistration,
  parseVin,
  restoreVehicle,
  snoozeAlert,
  handleAlert,
  sortHistory,
  timestamp,
  usableSchedule,
  type Evidence,
  type MaintenanceInterval,
  type ServiceDraft,
  type Vehicle,
  type VehicleId,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';

const ids = sequentialIds();
const profile = createLocalProfile(ids, T0);

function vehicle(overrides: Partial<Parameters<typeof createVehicle>[0]> = {}): Vehicle {
  const r = createVehicle(
    {
      ownerProfileId: profile.id,
      type: 'car',
      identity: { manufacturer: 'טויוטה', model: 'קורולה', year: 2019, engine: '1.6' },
      registration: '12-345-67',
      ...overrides,
    },
    ids,
    T0,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const manufacturerEvidence: Evidence = {
  authority: 'manufacturer',
  exactApplicability: true,
  reference: { sourceId: asId('00000000-0000-4000-8000-00000000abcd'), page: 412, table: '6-1' },
};

const oilInterval = (): MaintenanceInterval => ({
  id: ids.next(),
  label: 'Oil service',
  rule: 'earliest_of',
  everyKm: 15000,
  everyMonths: 12,
  items: [
    {
      id: ids.next(),
      title: 'שמן מנוע',
      actionType: 'replacement',
      manufacturerText: 'Replace every 15,000 km or 12 months',
      reference: manufacturerEvidence.reference!,
    },
  ],
});

describe('core primitives (T036)', () => {
  it('validates ISO dates strictly and does month arithmetic with clamping', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-9-1')).toBeNull();
    expect(addMonths(isoDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(isoDate('2025-12-15'), 12)).toBe('2026-12-15');
    expect(addMonths(isoDate('2026-03-31'), -1)).toBe('2026-02-28');
    expect(daysBetween(isoDate('2026-09-25'), isoDate('2026-12-15'))).toBe(81);
  });

  it('generates stable UUID ids and rejects malformed ids', () => {
    expect(() => asId('not-a-uuid')).toThrow();
    const v = vehicle();
    expect(v.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(v.version).toBe(1);
  });

  it('normalizes registration and masks the VIN to the last four characters', () => {
    const reg = parseRegistration('12-345-67')!;
    expect(reg).toBe('1234567');
    expect(formatRegistration(reg)).toBe('12-345-67');
    expect(formatRegistration(parseRegistration('123-45-678')!)).toBe('123-45-678');
    expect(parseRegistration('12-34')).toBeNull();
    expect(parseVin('JTDBR32E720123456')).not.toBeNull();
    expect(parseVin('JTDBR32E72012345I')).toBeNull(); // I is not allowed
    expect(maskVin(parseVin('JTDBR32E720123456')!)).toBe('••••••3456');
  });

  it('rejects invalid vehicles with field-level issues', () => {
    const r = createVehicle(
      {
        ownerProfileId: profile.id,
        type: 'truck' as never,
        identity: { manufacturer: ' ', model: '', year: 1800 },
        registration: 'abc',
        vin: 'short',
      },
      ids,
      T0,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code).sort()).toEqual(
        [
          'vehicle.manufacturer',
          'vehicle.model',
          'vehicle.registration',
          'vehicle.type',
          'vehicle.vin',
          'vehicle.year',
        ].sort(),
      );
    }
  });
});

describe('vehicle lifecycle and odometer (T036, invariants 15/17/20)', () => {
  it('archive keeps the vehicle (not deletion) and restore reactivates it', () => {
    const v = vehicle();
    const archived = archiveVehicle(v, timestamp('2026-09-26T00:00:00.000Z'));
    expect(archived.ok && archived.value.lifecycle).toBe('archived');
    if (!archived.ok) return;
    expect(archived.value.id).toBe(v.id);
    expect(archived.value.version).toBe(2);
    const restored = restoreVehicle(archived.value, timestamp('2026-09-27T00:00:00.000Z'));
    expect(restored.ok && restored.value.lifecycle).toBe('active');
    expect(archiveVehicle(archived.value, T0).ok).toBe(false);
  });

  it('odometer readings are per vehicle, dated, and cannot silently decrease', () => {
    const car = vehicle();
    const moto = vehicle({ type: 'motorcycle', registration: '123-45-678' });
    const r1 = createOdometerReading(
      { vehicleId: car.id, valueKm: 84250, measuredAt: isoDate('2026-09-10'), source: 'user' },
      [],
      ids,
      T0,
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // Another vehicle's history does not constrain this vehicle.
    const motoReading = createOdometerReading(
      { vehicleId: moto.id, valueKm: 100, measuredAt: isoDate('2026-09-20'), source: 'user' },
      [r1.value],
      ids,
      T0,
    );
    expect(motoReading.ok).toBe(true);
    const lower = createOdometerReading(
      { vehicleId: car.id, valueKm: 80000, measuredAt: isoDate('2026-09-20'), source: 'user' },
      [r1.value],
      ids,
      T0,
    );
    expect(!lower.ok && lower.issues[0].code).toBe('odometer.decrease');
    const allowed = createOdometerReading(
      {
        vehicleId: car.id,
        valueKm: 80000,
        measuredAt: isoDate('2026-09-20'),
        source: 'user',
        allowDecrease: true,
      },
      [r1.value],
      ids,
      T0,
    );
    expect(allowed.ok).toBe(true);
    const future = createOdometerReading(
      { vehicleId: car.id, valueKm: 90000, measuredAt: isoDate('2026-12-01'), source: 'user' },
      [r1.value],
      ids,
      T0,
    );
    expect(!future.ok && future.issues[0].code).toBe('odometer.future');
    if (allowed.ok) expect(latestReading([r1.value, allowed.value])?.valueKm).toBe(80000);
  });
});

describe('provenance & verification (T037)', () => {
  it('only authoritative + exact evidence verifies a maintenance requirement', () => {
    expect(decideVerification('maintenance_requirement', [], T0).state).toBe('pending');
    expect(
      decideVerification(
        'maintenance_requirement',
        [{ authority: 'user_report', exactApplicability: true }],
        T0,
      ).state,
    ).toBe('unverified');
    expect(
      decideVerification(
        'maintenance_requirement',
        [{ authority: 'garage_document', exactApplicability: true }],
        T0,
      ).state,
    ).toBe('unverified');
    expect(
      decideVerification(
        'maintenance_requirement',
        [{ ...manufacturerEvidence, exactApplicability: false }],
        T0,
      ).state,
    ).toBe('pending');
    expect(decideVerification('maintenance_requirement', [manufacturerEvidence], T0).state).toBe(
      'verified',
    );
  });

  it('conflicting authoritative sources are flagged, not resolved by guessing', () => {
    const r = decideVerification(
      'maintenance_requirement',
      [
        { ...manufacturerEvidence, assertedValue: '15000km' },
        { authority: 'official_importer', exactApplicability: true, assertedValue: '10000km' },
      ],
      T0,
    );
    expect(r.state).toBe('conflicting');
    expect(displayState(r.state)).toBe('unable_to_verify');
  });

  it('collapses internal states to the three distinguishable UI states', () => {
    expect(displayState('verified')).toBe('verified');
    expect(displayState('unverified')).toBe('pending');
    expect(displayState('pending')).toBe('pending');
    expect(displayState('unable_to_verify')).toBe('unable_to_verify');
  });
});

describe('maintenance schedule (T038, invariants 1–4)', () => {
  it('schedule verification is decided from evidence and exact applicability', () => {
    const v = vehicle();
    const verified = createSchedule(
      {
        vehicleId: v.id,
        intervals: [oilInterval()],
        evidence: [manufacturerEvidence],
        applicability: { matchedOn: ['manufacturer', 'model', 'year', 'engine'], exact: true },
      },
      ids,
      T0,
    );
    expect(verified.ok && verified.value.verification.state).toBe('verified');
    if (verified.ok) expect(usableSchedule(verified.value)).not.toBeNull();

    const notExact = createSchedule(
      {
        vehicleId: v.id,
        intervals: [oilInterval()],
        evidence: [manufacturerEvidence],
        applicability: { matchedOn: ['manufacturer', 'model'], exact: false },
      },
      ids,
      T0,
    );
    expect(notExact.ok && notExact.value.verification.state).toBe('pending');
    if (notExact.ok) expect(usableSchedule(notExact.value)).toBeNull();
  });

  it('rejects malformed intervals (earliest-of needs both limits; items need text)', () => {
    const v = vehicle();
    const bad = createSchedule(
      {
        vehicleId: v.id,
        intervals: [
          { ...oilInterval(), everyMonths: undefined },
          { ...oilInterval(), items: [] },
        ],
        evidence: [manufacturerEvidence],
        applicability: { matchedOn: [], exact: true },
      },
      ids,
      T0,
    );
    expect(!bad.ok && bad.issues.map((i) => i.code)).toEqual([
      'interval.earliestOf',
      'interval.items',
    ]);
  });
});

describe('service events (T039, invariants 7–10)', () => {
  const v = vehicle();
  const draft = (overrides: Partial<ServiceDraft> = {}): ServiceDraft => ({
    vehicleId: v.id,
    origin: 'manual',
    date: '2026-09-20',
    odometerKm: 84250,
    garageName: '',
    notes: '',
    actions: [
      {
        title: 'שמן מנוע',
        actionType: 'replacement',
        performed: true,
        maintenanceItemId: null,
        unlisted: false,
      },
      {
        title: 'בלמים',
        actionType: 'inspection',
        performed: false,
        maintenanceItemId: null,
        unlisted: false,
      },
      {
        title: 'שטיפת מנוע',
        actionType: 'other',
        performed: true,
        maintenanceItemId: null,
        unlisted: true,
      },
    ],
    documentIds: [],
    extractionId: null,
    ...overrides,
  });
  const confirm = { confirmedBy: 'user' as const, confirmedAt: T0 };

  it('manual entry needs only date, odometer and work performed; stores performed actions only', () => {
    const r = confirmServiceDraft(draft(), confirm, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.actions.map((a) => a.title)).toEqual(['שמן מנוע', 'שטיפת מנוע']);
    // Action type is independent from performed.
    expect(r.value.actions.map((a) => a.actionType)).toEqual(['replacement', 'other']);
    // A manual entry is a user report and is not independently verified.
    expect(r.value.authority).toBe('user_report');
    expect(r.value.verification.state).toBe('unverified');
  });

  it('rejects missing minimum data and requires explicit user confirmation', () => {
    const r = confirmServiceDraft(
      draft({ date: '2027-01-01', odometerKm: null, actions: [] }),
      confirm,
      ids,
    );
    expect(!r.ok && r.issues.map((i) => i.code).sort()).toEqual(
      ['service.actions', 'service.future', 'service.odometer'].sort(),
    );
    const noUser = confirmServiceDraft(
      draft(),
      { confirmedBy: 'ai' as never, confirmedAt: T0 },
      ids,
    );
    expect(noUser.ok).toBe(false);
  });

  it('document-derived drafts keep the original document and become garage evidence', () => {
    const missingDoc = confirmServiceDraft(draft({ origin: 'document' }), confirm, ids);
    expect(!missingDoc.ok && missingDoc.issues[0].code).toBe('service.document');
    const withDoc = confirmServiceDraft(
      draft({ origin: 'document', documentIds: [ids.next<'Document'>()] }),
      confirm,
      ids,
    );
    expect(withDoc.ok && withDoc.value.verification.state).toBe('verified');
    expect(withDoc.ok && withDoc.value.authority).toBe('garage_document');
  });

  it('history sorts newest first, independent of the schedule', () => {
    const a = confirmServiceDraft(draft({ date: '2025-12-10', odometerKm: 75120 }), confirm, ids);
    const b = confirmServiceDraft(draft({ date: '2026-04-02', odometerKm: 80300 }), confirm, ids);
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(sortHistory([a.value, b.value]).map((e) => e.date)).toEqual([
      '2026-04-02',
      '2025-12-10',
    ]);
  });
});

describe('documents (T040, invariant 6 and security)', () => {
  const base = {
    vehicleId: vehicle().id,
    kind: 'invoice' as const,
    title: 'חשבונית',
    origin: 'user_upload' as const,
    authority: 'garage_document' as const,
    original: {
      storageKey: 'local/doc-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    },
  };

  it('accepts a valid original and keeps it immutable-by-copy', () => {
    const r = createDocument(base, ids, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.original).not.toBe(base.original);
  });

  it('rejects public URLs, unsupported types and self-asserted official authority', () => {
    const r = createDocument(
      {
        ...base,
        authority: 'manufacturer',
        original: {
          ...base.original,
          storageKey: 'https://example.com/x.pdf',
          mimeType: 'text/html',
        },
      },
      ids,
      T0,
    );
    expect(!r.ok && r.issues.map((i) => i.code).sort()).toEqual(
      ['document.authority', 'document.mime', 'document.publicUrl'].sort(),
    );
  });
});

describe('garage recommendations & alerts (T041)', () => {
  const v = vehicle();

  it('garage recommendations are their own type with garage/user authority only', () => {
    const r = createGarageRecommendation(
      {
        vehicleId: v.id,
        text: 'להחליף רפידות',
        date: isoDate('2026-09-20'),
        garageName: null,
        sourceDocumentId: null,
      },
      ids,
      T0,
    );
    expect(r.ok && r.value.authority).toBe('user_report');
    // Type-level guarantee: a GarageRecommendation is not assignable to a manufacturer item.
    // @ts-expect-error — manufacturerText/reference/actionType are missing by design.
    const asItem: import('@/domain').MaintenanceItem = r.ok ? r.value : (null as never);
    expect(asItem).toBeDefined();
  });

  it('maintenance alerts must be explainable by a schedule interval', () => {
    const noBasis = createAlert(
      { vehicleId: v.id, kind: 'upcoming', basis: { facts: {} } },
      ids,
      T0,
    );
    expect(noBasis.ok).toBe(false);
    const ok = createAlert(
      {
        vehicleId: v.id,
        kind: 'upcoming',
        basis: { scheduleId: ids.next(), intervalId: ids.next(), facts: { remainingKm: 5750 } },
      },
      ids,
      T0,
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const snoozed = snoozeAlert(ok.value, isoDate('2026-10-01'), T0);
    expect(snoozed.ok && snoozed.value.status).toBe('deferred');
    const handled = handleAlert(ok.value, T0);
    expect(handled.ok && handled.value.status).toBe('handled');
    if (handled.ok) expect(handleAlert(handled.value, T0).ok).toBe(false);
  });
});

describe('vehicle isolation (invariants 14/16)', () => {
  it('detects records scoped to another vehicle', () => {
    const a = vehicle();
    const b = vehicle({ registration: '98-765-43' });
    const records: { vehicleId: VehicleId; n: number }[] = [
      { vehicleId: a.id, n: 1 },
      { vehicleId: b.id, n: 2 },
    ];
    expect(outOfScope(records, a.id)).toEqual([{ vehicleId: b.id, n: 2 }]);
  });
});
