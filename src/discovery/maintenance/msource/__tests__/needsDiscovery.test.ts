import { needsDiscovery, RESEARCH_AFTER_MS, type DiscoveryStatus } from '../status';

/** Automatic re-search (owner directive 2026-10-03: no manual "search again"). */

const NOW = Date.parse('2026-10-03T20:00:00.000Z');
const status = (over: Partial<DiscoveryStatus>): DiscoveryStatus => ({
  state: 'NO_SOURCE_FOUND',
  partial: false,
  retryAvailable: true,
  uploadDocumentAvailable: true,
  sourcesFound: 0,
  sourcesUsed: 0,
  updatedAt: '2026-10-03T19:00:00.000Z',
  catalogVersion: 'v2',
  ...over,
});

describe('needsDiscovery', () => {
  it('never searched or interrupted → search', () => {
    expect(needsDiscovery(null, 'v2', NOW)).toBe(true);
    expect(needsDiscovery(status({ state: 'DISCOVERING_SOURCES' }), 'v2', NOW)).toBe(true);
  });

  it('"nothing found" against an older bundled catalog → search again (no tap needed)', () => {
    expect(needsDiscovery(status({ catalogVersion: 'v1' }), 'v2', NOW)).toBe(true);
    expect(needsDiscovery(status({ catalogVersion: undefined }), 'v2', NOW)).toBe(true);
  });

  it('a fresh incomplete result against the current catalog is not repeated; a stale one is', () => {
    expect(needsDiscovery(status({}), 'v2', NOW)).toBe(false);
    const old = new Date(NOW - RESEARCH_AFTER_MS - 1000).toISOString();
    expect(needsDiscovery(status({ updatedAt: old }), 'v2', NOW)).toBe(true);
    expect(
      needsDiscovery(status({ state: 'READY', partial: true, updatedAt: old }), 'v2', NOW),
    ).toBe(true);
  });

  it('a complete schedule is never searched again automatically', () => {
    const old = new Date(NOW - 30 * RESEARCH_AFTER_MS).toISOString();
    expect(
      needsDiscovery(
        status({ state: 'READY', partial: false, updatedAt: old, catalogVersion: 'v1' }),
        'v2',
        NOW,
      ),
    ).toBe(false);
  });
});
