import { createSchedule, timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import type { OfficialDomainEntry } from '@/discovery/authority';
import type { KnownOfficialDocument } from '@/discovery/hybrid';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';
import type { FetchedFile } from '@/discovery/retrieval';
import type { DiscoveryProvider, VehicleIdentityQuery } from '@/discovery/types';

import { planOfficialSource, type SourceServices } from '../sourceService';

/**
 * G3 zero-cost path: a human-curated, hash-pinned schedule stands in for OCR/AI. The pinned hash
 * IS the document verification; applicability and verification are still decided downstream.
 */

// FIXTURES ONLY — reserved `.test` TLD; not claims about real manufacturers or documents.
const REGISTRY: OfficialDomainEntry[] = [
  {
    manufacturer: 'toyota',
    kind: 'official_importer',
    domain: 'importer-il.test',
    market: 'IL',
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
];
const URL_ = 'https://importer-il.test/corolla-service.pdf';
const PINNED = 'a'.repeat(64);

const curatedDoc: KnownOfficialDocument = {
  manufacturer: 'toyota',
  url: URL_,
  title: 'Corolla service booklet',
  models: ['Corolla'],
  verifiedBy: 'fixture',
  verifiedAt: '2026-09-26',
  curated: {
    sha256: PINNED,
    coverage: {
      manufacturer: 'Toyota',
      models: ['Corolla'],
      yearFrom: 2018,
      yearTo: 2022,
      engines: ['1.6'],
      markets: ['IL'],
      documentKind: 'maintenance_schedule',
    },
    intervals: [
      {
        label: 'טיפול תקופתי',
        rule: 'earliest_of',
        everyKm: 15000,
        everyMonths: 12,
        items: [
          {
            title: 'החלפת שמן מנוע',
            actionType: 'replacement',
            manufacturerText: 'Replace engine oil',
            page: 12,
            table: 'Maintenance schedule',
            quote: 'Replace engine oil every 15,000 km or 12 months',
          },
        ],
      },
    ],
    curatedBy: 'fixture',
    curatedAt: '2026-09-26',
  },
};

const identity: VehicleIdentityQuery = {
  type: 'car',
  manufacturer: 'טויוטה',
  model: 'Corolla',
  year: 2019,
  engine: '1.6',
  market: 'IL',
};
const discovery: DiscoveryProvider = {
  id: 'fixture',
  search: async () => [{ url: URL_, title: 'Corolla service booklet', discoveredBy: 'fixture' }],
};
const retrieverWith = (sha256: string) => ({
  fetch: async (): Promise<FetchedFile> => ({
    finalUrl: URL_,
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    sha256,
    storageKey: 'src-1',
  }),
});
const services = (sha256: string): SourceServices => ({
  discovery,
  retriever: retrieverWith(sha256),
  registry: REGISTRY,
  aliases: MANUFACTURER_ALIASES,
  reader: null, // no OCR/AI at all (G3)
  curated: [curatedDoc],
  uriFor: (k) => `file:///${k}`,
});
const vehicleId = 'veh-1' as VehicleId;
const now = () => timestamp('2026-09-26T09:00:00.000Z');

it('the pinned document yields a verified, fully referenced schedule without OCR/AI', async () => {
  const plan = await planOfficialSource(
    vehicleId,
    identity,
    services(PINNED),
    sequentialIds(1),
    now,
  );
  expect(plan.status).toBe('verified');
  if (plan.status === 'not_found') throw new Error('unreachable');
  expect(plan.document.verification?.state).toBe('verified');
  const item = plan.schedule!.intervals[0].items[0];
  expect(item.reference).toMatchObject({
    sourceId: plan.source.id,
    documentId: plan.document.id,
    page: 12,
    quote: 'Replace engine oil every 15,000 km or 12 months',
  });
  const schedule = createSchedule(plan.schedule!, sequentialIds(100), now());
  expect(schedule.ok).toBe(true);
});

it('different bytes at the same URL are NOT the curated document: nothing is read', async () => {
  const plan = await planOfficialSource(
    vehicleId,
    identity,
    services('b'.repeat(64)),
    sequentialIds(1),
    now,
  );
  expect(plan.status).toBe('not_found');
});

it('a curated schedule never widens applicability: a different model is not verified', async () => {
  const plan = await planOfficialSource(
    vehicleId,
    { ...identity, model: 'Yaris' },
    services(PINNED),
    sequentialIds(1),
    now,
  );
  expect(plan.status === 'verified').toBe(false);
});
