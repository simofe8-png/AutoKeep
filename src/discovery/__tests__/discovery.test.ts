import { asId, timestamp } from '@/domain';

import { engineLiters, matchApplicability } from '../applicability';
import { classifyAuthority, normalizeManufacturer, type OfficialDomainEntry } from '../authority';
import { discoverOfficialSource, type DiscoveryDeps, type DiscoveryStep } from '../pipeline';
import { MANUFACTURER_ALIASES, OFFICIAL_DOMAINS } from '../registry';
import { recordVersion, retrieveOfficial, type FetchedFile } from '../retrieval';
import type { DocumentCoverage, SourceCandidate, VehicleIdentityQuery } from '../types';

// FIXTURES ONLY — reserved `.test` TLD; not claims about real manufacturers' domains.
const REGISTRY: OfficialDomainEntry[] = [
  {
    manufacturer: 'toyota',
    kind: 'manufacturer',
    domain: 'maker-toyota.test',
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
  {
    manufacturer: 'toyota',
    kind: 'official_importer',
    domain: 'importer-il.test',
    market: 'IL',
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
];
const key = (n: string) => normalizeManufacturer(n, MANUFACTURER_ALIASES);
const cand = (url: string, title = 'Owner manual'): SourceCandidate => ({
  url,
  title,
  discoveredBy: 'fixture',
});

const identity: VehicleIdentityQuery = {
  type: 'car',
  manufacturer: 'טויוטה',
  model: 'Corolla',
  year: 2019,
  engine: '1.6',
  market: 'IL',
};

const coverage = (over: Partial<DocumentCoverage> = {}): DocumentCoverage => ({
  manufacturer: 'Toyota',
  models: ['Corolla'],
  yearFrom: 2018,
  yearTo: 2022,
  engines: ['1.6', '1.8 Hybrid'],
  markets: ['IL', 'EU'],
  documentKind: 'maintenance_schedule',
  ...over,
});

describe('authority classification (T080)', () => {
  const classify = (url: string) =>
    classifyAuthority(cand(url), 'טויוטה', REGISTRY, MANUFACTURER_ALIASES).authority;

  it('recognizes official manufacturer / importer domains and their subdomains (HTTPS only)', () => {
    expect(classify('https://maker-toyota.test/manuals/corolla.pdf')).toBe('manufacturer');
    expect(classify('https://docs.maker-toyota.test/x.pdf')).toBe('manufacturer');
    expect(classify('https://importer-il.test/service.pdf')).toBe('official_importer');
    expect(classify('http://maker-toyota.test/x.pdf')).toBe('third_party');
  });

  it('never grants authority to lookalikes, credentials-in-URL or other manufacturers', () => {
    expect(classify('https://maker-toyota.test.evil.test/x.pdf')).toBe('third_party');
    expect(classify('https://evilmaker-toyota.test/x.pdf')).toBe('third_party');
    expect(classify('https://maker-toyota.test@evil.test/x.pdf')).toBe('third_party');
    expect(
      classifyAuthority(
        cand('https://maker-toyota.test/x.pdf'),
        'מאזדה',
        REGISTRY,
        MANUFACTURER_ALIASES,
      ).authority,
    ).toBe('third_party');
  });

  it('the shipped registry is empty until verified: everything is third-party (no guessing)', () => {
    expect(OFFICIAL_DOMAINS).toEqual([]);
    expect(
      classifyAuthority(
        cand('https://maker-toyota.test/x.pdf'),
        'toyota',
        OFFICIAL_DOMAINS,
        MANUFACTURER_ALIASES,
      ).authority,
    ).toBe('third_party');
  });
});

describe('exact applicability (T082)', () => {
  it('exact when model, year, engine and market are all proven', () => {
    expect(matchApplicability(identity, coverage(), key)).toEqual({
      status: 'exact',
      matchedOn: ['manufacturer', 'model', 'year', 'engine', 'market'],
    });
  });

  it('mismatches are rejected with reasons', () => {
    expect(matchApplicability(identity, coverage({ models: ['Yaris'] }), key)).toMatchObject({
      status: 'mismatch',
      reasons: ['model_mismatch'],
    });
    expect(matchApplicability(identity, coverage({ yearTo: 2018 }), key)).toMatchObject({
      reasons: ['year_out_of_range'],
    });
    expect(matchApplicability(identity, coverage({ engines: ['2.0'] }), key)).toMatchObject({
      reasons: ['engine_not_covered'],
    });
    expect(matchApplicability(identity, coverage({ documentKind: 'other' }), key)).toMatchObject({
      status: 'mismatch',
    });
  });

  it('missing or ambiguous facts are "not proven", never assumed', () => {
    const noEngine = { ...identity, engine: undefined };
    expect(matchApplicability(noEngine, coverage(), key)).toMatchObject({
      status: 'not_proven',
      reasons: ['engine_ambiguous'],
    });
    expect(
      matchApplicability(identity, coverage({ yearFrom: undefined, yearTo: undefined }), key),
    ).toMatchObject({
      status: 'not_proven',
      reasons: ['year_unknown'],
    });
    expect(matchApplicability(identity, coverage({ markets: ['US'] }), key)).toMatchObject({
      status: 'not_proven',
      reasons: ['market_not_covered'],
    });
  });

  it('normalizes engine notations', () => {
    expect(engineLiters('1998 סמ״ק')).toBe('2.0');
    expect(engineLiters('2.0L')).toBe('2.0');
    expect(engineLiters('1,6')).toBe('1.6');
    expect(engineLiters('300cc')).toBe('0.3');
  });
});

const pdf = (url: string, over: Partial<FetchedFile> = {}): FetchedFile => ({
  finalUrl: url,
  mimeType: 'application/pdf',
  sizeBytes: 1000,
  sha256: 'a'.repeat(64),
  storageKey: 'local/src.pdf',
  ...over,
});
const isOfficial = (u: string) =>
  classifyAuthority(cand(u), 'toyota', REGISTRY, MANUFACTURER_ALIASES).authority !== 'third_party';

describe('retrieval & versioning (T083)', () => {
  it('rejects redirects off official domains and non-PDF / oversized / empty files', async () => {
    const r = (f: FetchedFile) =>
      retrieveOfficial({ fetch: async () => f }, 'https://maker-toyota.test/a.pdf', isOfficial);
    expect(await r(pdf('https://evil.test/a.pdf'))).toEqual({
      ok: false,
      reason: 'redirected_off_official',
    });
    expect(await r(pdf('https://maker-toyota.test/a.pdf', { mimeType: 'text/html' }))).toEqual({
      ok: false,
      reason: 'not_pdf',
    });
    expect(
      await r(pdf('https://maker-toyota.test/a.pdf', { sizeBytes: 60 * 1024 * 1024 })),
    ).toEqual({ ok: false, reason: 'too_large' });
    expect(await r(pdf('https://maker-toyota.test/a.pdf', { sizeBytes: 0 }))).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(
      await retrieveOfficial(
        { fetch: async () => Promise.reject(new Error('x')) },
        'https://maker-toyota.test/a.pdf',
        isOfficial,
      ),
    ).toEqual({ ok: false, reason: 'network' });
  });

  it('a changed file is a new version; identical content is not duplicated', () => {
    const v1 = recordVersion(
      [],
      'https://maker-toyota.test/a.pdf',
      'a'.repeat(64),
      '2026-01-01',
      'ed.1',
    );
    const same = recordVersion(
      v1.history,
      'https://maker-toyota.test/a.pdf',
      'a'.repeat(64),
      '2026-02-01',
    );
    expect(same.isNew).toBe(false);
    const v2 = recordVersion(
      v1.history,
      'https://maker-toyota.test/a.pdf',
      'b'.repeat(64),
      '2026-03-01',
      'ed.2',
    );
    expect(v2.isNew).toBe(true);
    expect(v2.history.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(v2.history[0].sha256).toBe('a'.repeat(64)); // old version preserved
  });
});

describe('discovery pipeline: provenance & no-source handling (T081/T084/T085)', () => {
  const deps = (
    over: Partial<DiscoveryDeps> & {
      candidates?: SourceCandidate[];
      cov?: DocumentCoverage | null;
    } = {},
  ) => {
    const steps: DiscoveryStep[] = [];
    const d: DiscoveryDeps = {
      provider: { id: 'fixture', search: async () => over.candidates ?? [] },
      retriever: { fetch: async (url) => pdf(url) },
      coverage: { read: async () => (over.cov === undefined ? coverage() : over.cov) },
      registry: REGISTRY,
      aliases: MANUFACTURER_ALIASES,
      sourceId: () => asId('00000000-0000-4000-8000-00000000cafe'),
      now: () => timestamp('2026-09-26T00:00:00.000Z'),
      onStep: (s) => steps.push(s),
      ...over,
    };
    return { d, steps };
  };

  it('official + exact → verified, with provenance evidence and ordered progress steps', async () => {
    const { d, steps } = deps({ candidates: [cand('https://maker-toyota.test/corolla.pdf')] });
    const r = await discoverOfficialSource(identity, d);
    expect(r.status).toBe('verified');
    if (r.status !== 'verified') return;
    expect(r.source.evidence).toEqual({
      authority: 'manufacturer',
      exactApplicability: true,
      reference: { sourceId: '00000000-0000-4000-8000-00000000cafe' },
    });
    expect(steps).toEqual([
      'discovery',
      'authority',
      'retrieval',
      'extraction',
      'applicability',
      'validation',
    ]);
  });

  it('source poisoning: an unofficial page claiming to be the official manual is rejected', async () => {
    const { d } = deps({
      candidates: [
        cand('https://manuals-free.test/toyota-corolla.pdf', 'Toyota OFFICIAL Corolla manual'),
      ],
    });
    const r = await discoverOfficialSource(identity, d);
    expect(r).toMatchObject({
      status: 'not_found',
      rejected: [{ reason: 'not_official_for_manufacturer' }],
    });
  });

  it('official but not provably exact → pending (never verified by assumption)', async () => {
    const { d } = deps({
      candidates: [cand('https://importer-il.test/corolla.pdf')],
      cov: coverage({ yearFrom: undefined, yearTo: undefined }),
    });
    const r = await discoverOfficialSource(identity, d);
    expect(r.status).toBe('pending');
    if (r.status === 'pending') expect(r.best.evidence.exactApplicability).toBe(false);
  });

  it('nothing found / unreadable / provider failure → not_found with reasons, nothing invented', async () => {
    expect(await discoverOfficialSource(identity, deps().d)).toEqual({
      status: 'not_found',
      rejected: [],
    });
    const unreadable = await discoverOfficialSource(
      identity,
      deps({ candidates: [cand('https://maker-toyota.test/x.pdf')], cov: null }).d,
    );
    expect(unreadable).toMatchObject({
      status: 'not_found',
      rejected: [{ reason: 'coverage_unreadable' }],
    });
    const failing = deps();
    failing.d.provider = { id: 'down', search: async () => Promise.reject(new Error('503')) };
    expect(await discoverOfficialSource(identity, failing.d)).toMatchObject({
      status: 'not_found',
      providerError: true,
    });
  });

  it('prefers an exact official source over an earlier non-exact one', async () => {
    let n = 0;
    const { d } = deps({
      candidates: [
        cand('https://importer-il.test/generic.pdf'),
        cand('https://maker-toyota.test/exact.pdf'),
      ],
    });
    d.coverage = { read: async () => (n++ === 0 ? coverage({ markets: ['US'] }) : coverage()) };
    const r = await discoverOfficialSource(identity, d);
    expect(r.status === 'verified' && r.source.candidate.url).toBe(
      'https://maker-toyota.test/exact.pdf',
    );
  });
});

describe('manufacturer names as the Ministry of Transport writes them', () => {
  it('maps spelling variants and (truncated) country suffixes to one key, whole words only', () => {
    expect(key('מזדה')).toBe('mazda');
    expect(key('מאזדה')).toBe('mazda');
    expect(key('פולקסווגן גרמנ')).toBe('volkswagen');
    expect(key('קיה ד. קוריאה')).toBe('kia');
    expect(key('סאן יאנג  טייוואן')).toBe('sym');
    expect(key('Toyota')).toBe('toyota');
    // No partial-word matches: an unknown maker never borrows a known key.
    expect(key('קיהמוטורס')).toBe('קיהמוטורס');
    expect(key('טויוטהX יפן')).toBe('טויוטהx יפן');
  });
});
