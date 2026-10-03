import type { DiscoveryStatus } from '@/discovery/maintenance/msource/status';
import type { VehicleRegistryRecord } from '@/providers/registry/vehicleRecord';

import { discoveryPresentation, verifiedIdentity } from '../planVM';

// SYNTHETIC registry record (values altered; no real vehicle).
const record: VehicleRegistryRecord = {
  sources: ['test'],
  retrievedAt: '2026-10-03T00:00:00.000Z',
  facts: [
    { key: 'vin', group: 'identity', kind: 'text', value: 'VSSZZZ6JZCR000001' },
    { key: 'fuel', group: 'technical', kind: 'text', value: 'בנזין' },
    { key: 'engineCode', group: 'technical', kind: 'text', value: 'CGG' },
    { key: 'modelYear', group: 'identity', kind: 'number', value: 2012 },
    { key: 'commercialName', group: 'identity', kind: 'text', value: 'IBIZA' },
    { key: 'manufacturerRegistered', group: 'identity', kind: 'text', value: 'סיאט ספרד' },
    { key: 'color', group: 'identity', kind: 'text', value: 'לבן' },
  ],
};

const status = (over: Partial<DiscoveryStatus>): DiscoveryStatus => ({
  state: 'INSUFFICIENT_EVIDENCE',
  partial: false,
  retryAvailable: true,
  uploadDocumentAvailable: true,
  sourcesFound: 3,
  sourcesUsed: 0,
  updatedAt: '2026-10-03T00:00:00.000Z',
  ...over,
});

describe('verifiedIdentity', () => {
  it('keeps only the maintenance identity facts, in display order; never the VIN', () => {
    expect(verifiedIdentity(record)?.map((f) => f.key)).toEqual([
      'manufacturerRegistered',
      'commercialName',
      'modelYear',
      'engineCode',
      'fuel',
    ]);
  });

  it('adds nothing the record does not state (no displacement here)', () => {
    expect(verifiedIdentity(record)?.some((f) => f.key === 'displacement')).toBe(false);
  });

  it('is null without a record, or when make, model or year is missing', () => {
    expect(verifiedIdentity(null)).toBeNull();
    expect(
      verifiedIdentity({ ...record, facts: record.facts.filter((f) => f.key !== 'modelYear') }),
    ).toBeNull();
  });
});

describe('discoveryPresentation', () => {
  const id = verifiedIdentity(record);

  it('VERIFIED_IDENTITY_ONLY when the registry identified the vehicle and no schedule matched', () => {
    expect(discoveryPresentation(status({}), id)).toBe('VERIFIED_IDENTITY_ONLY');
    expect(discoveryPresentation(status({ state: 'NO_SOURCE_FOUND' }), id)).toBe(
      'VERIFIED_IDENTITY_ONLY',
    );
  });

  it('keeps every other state as it is', () => {
    expect(discoveryPresentation(status({}), null)).toBe('INSUFFICIENT_EVIDENCE');
    expect(discoveryPresentation(status({ error: 'network' }), id)).toBe('INSUFFICIENT_EVIDENCE');
    for (const s of [
      'READY',
      'CONDITIONALLY_READY',
      'CONFLICTING_EVIDENCE',
      'BUILDING_SCHEDULE',
    ] as const) {
      expect(discoveryPresentation(status({ state: s }), id)).toBe(s);
    }
  });
});
