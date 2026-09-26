import type { DiscoveryProvider, SourceCandidate } from '@/discovery/types';

/**
 * MOCK discovery provider — clearly labeled, never a real integration (G1 decision: no runtime
 * discovery provider chosen yet). It returns scripted candidates so the discovery pipeline and
 * the source-search UI can run end to end. Its candidates are still subject to the verified
 * official-domain registry, so with the shipped (empty) registry nothing it returns can become
 * trusted — the schedule correctly stays unavailable.
 */
export class MockDiscoveryProvider implements DiscoveryProvider {
  readonly id = 'mock-discovery@1';

  constructor(private readonly candidates: SourceCandidate[] = []) {}

  async search(): Promise<SourceCandidate[]> {
    return this.candidates.map((c) => ({ ...c, discoveredBy: this.id }));
  }
}
