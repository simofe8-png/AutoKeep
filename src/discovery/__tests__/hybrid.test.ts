import { classifyAuthority, type OfficialDomainEntry } from '../authority';
import {
  HybridDiscoveryProvider,
  KnownSourceProvider,
  WebDiscoveryProvider,
  type KnownOfficialDocument,
  type WebSearchPort,
} from '../hybrid';
import { MANUFACTURER_ALIASES } from '../registry';
import type { VehicleIdentityQuery } from '../types';

// TEST FIXTURES — not real verified entries.
const REGISTRY: OfficialDomainEntry[] = [
  {
    manufacturer: 'toyota',
    kind: 'official_importer',
    domain: 'importer.example',
    market: 'IL',
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
];
const KNOWN: KnownOfficialDocument[] = [
  {
    manufacturer: 'Toyota',
    url: 'https://importer.example/manuals/corolla-2019-2022.pdf',
    title: 'Corolla owner manual',
    models: ['קורולה', 'Corolla'],
    yearFrom: 2019,
    yearTo: 2022,
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
];
const corolla: VehicleIdentityQuery = {
  type: 'car',
  manufacturer: 'טויוטה',
  model: 'קורולה',
  year: 2020,
  market: 'IL',
};

function fakeWeb(results: { url: string; title: string }[]) {
  const queries: string[] = [];
  const port: WebSearchPort = { id: 'fake-web', search: async (q) => (queries.push(q), results) };
  return { port, queries };
}

describe('hybrid discovery (ADR-0016)', () => {
  it('known official sources come first; web discovery is not used when they match', async () => {
    const web = fakeWeb([{ url: 'https://elsewhere.example/x.pdf', title: 'x' }]);
    const hybrid = new HybridDiscoveryProvider(
      new KnownSourceProvider(KNOWN, MANUFACTURER_ALIASES),
      new WebDiscoveryProvider(web.port, REGISTRY, MANUFACTURER_ALIASES),
    );
    const c = await hybrid.search(corolla);
    expect(c.map((x) => x.url)).toEqual([KNOWN[0].url]);
    expect(web.queries).toEqual([]);
  });

  it('falls back to web discovery only when no known source matches (year out of range)', async () => {
    const web = fakeWeb([
      { url: 'https://importer.example/corolla-2023.pdf', title: 'Corolla 2023' },
    ]);
    const hybrid = new HybridDiscoveryProvider(
      new KnownSourceProvider(KNOWN, MANUFACTURER_ALIASES),
      new WebDiscoveryProvider(web.port, REGISTRY, MANUFACTURER_ALIASES),
    );
    const c = await hybrid.search({ ...corolla, year: 2023 });
    expect(c.map((x) => x.url)).toEqual(['https://importer.example/corolla-2023.pdf']);
    // The search is steered to the verified official domain of that manufacturer.
    expect(web.queries[0]).toMatch(/site:importer\.example/);
  });

  it('a web result is only a candidate: off-registry hosts gain no authority', async () => {
    const web = fakeWeb([
      { url: 'https://importer.example.evil.io/corolla.pdf', title: 'official!' },
    ]);
    const provider = new WebDiscoveryProvider(web.port, REGISTRY, MANUFACTURER_ALIASES);
    const [candidate] = await provider.search({ ...corolla, year: 2023 });
    expect(classifyAuthority(candidate, 'טויוטה', REGISTRY, MANUFACTURER_ALIASES).authority).toBe(
      'third_party',
    );
  });

  it('without a web vendor and without a known source, the honest result is empty', async () => {
    const hybrid = new HybridDiscoveryProvider(
      new KnownSourceProvider([], MANUFACTURER_ALIASES),
      null,
    );
    expect(await hybrid.search(corolla)).toEqual([]);
  });
});
