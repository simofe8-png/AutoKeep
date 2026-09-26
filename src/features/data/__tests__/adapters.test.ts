import {
  asId,
  createSchedule,
  isoDate,
  newMeta,
  type Alert,
  type Evidence,
  type MaintenanceSchedule,
  type OdometerReading,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { alertCandidates } from '@/engine/alerts';
import { computeMaintenance } from '@/engine/maintenance';
import { he } from '@/i18n/he';

import {
  intervalLabel,
  locatorOf,
  matchAlerts,
  toAlertVM,
  toDocumentVM,
  toScheduleVM,
} from '../adapters';

const ids = sequentialIds(700);
const vehicleId = asId<'Vehicle'>('00000000-0000-4000-8000-0000000000aa');
const sourceId = asId<'Source'>('00000000-0000-4000-8000-00000000cccc');
const OIL = asId<'MaintenanceItem'>('00000000-0000-4000-8000-00000000a001');

function schedule(evidence: Evidence[], exact = true): MaintenanceSchedule {
  const r = createSchedule(
    {
      vehicleId,
      intervals: [
        {
          id: ids.next(),
          label: 'A',
          rule: 'earliest_of',
          everyKm: 10000,
          everyMonths: 12,
          items: [
            {
              id: OIL,
              title: 'שמן מנוע',
              actionType: 'replacement',
              manufacturerText: 'החלפה',
              reference: { sourceId, page: 88, section: '6.3', table: '6-1' },
            },
          ],
        },
      ],
      evidence,
      applicability: { matchedOn: ['model'], exact },
    },
    ids,
    T0,
  );
  if (!r.ok) throw new Error('fixture');
  return r.value;
}

const manufacturer: Evidence = {
  authority: 'manufacturer',
  exactApplicability: true,
  reference: { sourceId },
};

function reading(km: number, date: string): OdometerReading {
  return {
    id: ids.next(),
    vehicleId,
    valueKm: km,
    measuredAt: isoDate(date),
    source: 'user',
    ...newMeta(T0),
  };
}

describe('provenance adapters (T105)', () => {
  it('formats the exact source location', () => {
    expect(locatorOf({ sourceId, page: 412, section: '6.3', table: '6-1' })).toBe(
      'עמ׳ 412 · סעיף 6.3 · טבלה 6-1',
    );
    expect(locatorOf({ sourceId, figure: '6-4' })).toBe('איור 6-4');
    expect(locatorOf({ sourceId })).toBeUndefined();
  });

  it('describes interval rules without inventing a dimension', () => {
    const s = schedule([manufacturer]);
    expect(intervalLabel(s.intervals[0])).toBe('כל 10,000 ק״מ או 12 חודשים — המוקדם מביניהם');
    expect(intervalLabel({ ...s.intervals[0], rule: 'time_only', everyKm: undefined })).toBe(
      'כל 12 חודשים',
    );
    expect(
      intervalLabel({ ...s.intervals[0], rule: 'distance_only', everyMonths: undefined }),
    ).toBe('כל 10,000 ק״מ');
  });

  it('item sources carry the title, edition and exact locator', () => {
    const s = schedule([manufacturer]);
    const result = computeMaintenance({
      today: isoDate('2026-09-26'),
      schedule: s,
      history: [],
      readings: [reading(9000, '2026-09-20')],
      deferred: [],
    });
    const vm = toScheduleVM(
      s,
      [
        {
          id: sourceId,
          authority: 'manufacturer',
          title: 'Owner manual',
          publisher: 'Maker',
          edition: '2024-03',
          ...newMeta(T0),
        },
      ],
      result,
    );
    expect(vm.status).toBe('verified');
    expect(vm.source).toMatchObject({ sourceTitle: 'Owner manual', version: '2024-03' });
    expect(vm.next!.items[0].source).toMatchObject({
      sourceTitle: 'Owner manual',
      authority: 'manufacturer',
      locator: 'עמ׳ 88 · סעיף 6.3 · טבלה 6-1',
    });
  });
});

describe('schedule availability (T104): unverified schedules show nothing professional', () => {
  const unavailable = (s: MaintenanceSchedule | null) =>
    toScheduleVM(
      s,
      [],
      computeMaintenance({
        today: isoDate('2026-09-26'),
        schedule: s,
        history: [],
        readings: [],
        deferred: [],
      }),
    );

  it.each([
    ['no schedule', null, 'pending', he.data.reasonNoSource],
    ['not exact', schedule([manufacturer], false), 'pending', he.data.reasonNotExact],
    [
      'not official',
      schedule([{ authority: 'user_report', exactApplicability: true }]),
      'pending',
      he.data.reasonNotOfficial,
    ],
    [
      'conflicting',
      schedule([
        { ...manufacturer, assertedValue: '10000' },
        { ...manufacturer, assertedValue: '15000' },
      ]),
      'unable_to_verify',
      he.data.reasonConflicting,
    ],
  ])('%s', (_name, s, status, reason) => {
    const vm = unavailable(s);
    expect(vm).toEqual({ status, statusReason: reason, upcoming: [] });
  });
});

describe('documents', () => {
  it('keeps extraction status separate from the original; a draft is not "validated"', () => {
    const doc = {
      id: asId<'Document'>('00000000-0000-4000-8000-00000000d001'),
      vehicleId,
      kind: 'invoice' as const,
      title: 'חשבונית',
      origin: 'camera_scan' as const,
      authority: 'garage_document' as const,
      original: { storageKey: 'k', mimeType: 'image/jpeg', sizeBytes: 1, sha256: 'a'.repeat(64) },
      verification: null,
      ...newMeta(T0),
    };
    const ext = (status: 'draft' | 'rejected') => ({
      id: ids.next<'Extraction'>(),
      documentId: doc.id,
      vehicleId,
      kind: 'invoice' as const,
      status,
      producedBy: 'mock',
      payload: {},
      uncertainFields: [],
      ...newMeta(T0),
    });
    expect(toDocumentVM(doc, []).extraction).toBe('none');
    expect(toDocumentVM(doc, [ext('draft')]).extraction).toBe('partial');
    expect(toDocumentVM(doc, [ext('draft'), ext('rejected')]).extraction).toBe('failed');
    expect(toDocumentVM(doc, []).verification).toBe('pending');
  });
});

describe('alerts', () => {
  it('upcoming alert explains remaining distance/time, basis and last completion', () => {
    const s = schedule([manufacturer]);
    const readings = [reading(9200, '2026-09-20')];
    const today = isoDate('2026-09-26');
    const result = computeMaintenance({ today, schedule: s, history: [], readings, deferred: [] });
    const candidates = alertCandidates({
      today,
      result,
      schedule: s,
      deferred: [],
      latestReading: readings[0],
    });
    // First occurrence is the 10,000 km milestone; no history → never "overdue".
    expect(candidates.map((c) => c.kind)).toEqual(['upcoming']);
    const alert: Alert = {
      id: ids.next(),
      vehicleId,
      kind: 'upcoming',
      status: 'active',
      basis: candidates[0].basis,
      raisedAt: T0,
      snoozedUntil: null,
      ...newMeta(T0),
    };
    expect(matchAlerts([alert], candidates)).toHaveLength(1);
    const vm = toAlertVM(alert, candidates[0], { schedule: s, sources: [] });
    expect(vm.title).toBe(he.data.alertUpcoming('טיפול 10,000 ק״מ'));
    expect(vm.reason).toBe(he.data.remainingKm('800 ק״מ'));
    expect(vm.basis).toMatch(/לוח תחזוקה מאומת/);
    expect(vm.basis).toMatch(/9,200/);
    expect(vm.lastCompletion).toBe(he.data.noRecordedCompletion);
  });

  it('no maintenance alerts from an unverified schedule; stale odometer still reported', () => {
    const s = schedule([manufacturer], false);
    const today = isoDate('2026-09-26');
    const readings = [reading(9900, '2026-06-01')];
    const result = computeMaintenance({ today, schedule: s, history: [], readings, deferred: [] });
    const kinds = alertCandidates({
      today,
      result,
      schedule: s,
      deferred: [],
      latestReading: readings[0],
    }).map((c) => c.kind);
    expect(kinds).toEqual(['stale_odometer']);
  });
});
