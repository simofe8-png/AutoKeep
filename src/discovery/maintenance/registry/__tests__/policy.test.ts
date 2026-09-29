import type { EvidenceLevel } from '@/domain';

import { accessDecision } from '../../access';
import type { Http } from '../../types';
import {
  currentPolicy,
  permits,
  policy,
  policyIssues,
  revisePolicy,
  type PolicyEvidence,
} from '../policy';
import { sourceSystemIssues, systemForHost, type SourceSystemType } from '../sourceSystem';
import { FIXTURE_DATE, fixtureIsraeliSystem, fixturePolicy, fixtureSystem } from '../testing';

/** M-SOURCE Steps 2–3 — SYNTHETIC fixtures only. */
const D = FIXTURE_DATE;
const terms = (id: string, quote: string): PolicyEvidence => ({
  id,
  kind: 'terms',
  url: 'https://synthetic.example/terms',
  quote,
  reviewedAt: D,
  reviewedBy: 'test',
});
const robots: PolicyEvidence = {
  id: 'robots',
  kind: 'robots',
  url: 'https://synthetic.example/robots.txt',
  quote: 'User-agent: * Allow: /',
  reviewedAt: D,
  reviewedBy: 'test',
};
const owner: PolicyEvidence = {
  id: 'owner',
  kind: 'owner_decision',
  quote: 'owner decision (synthetic)',
  reviewedAt: D,
  reviewedBy: 'test',
};

const noNetwork: Http = async () => {
  throw new Error('no network expected');
};
const ctx = (registry = [fixtureSystem()]) => ({
  http: noNetwork,
  registry,
  aliases: {},
  robots: new Map<string, string | null>([['synthetic.example', '']]),
});

describe('Step 2 — source-system records', () => {
  it('a coherent record is valid; incoherent records are rejected', () => {
    expect(sourceSystemIssues(fixtureSystem())).toEqual([]);
    expect(sourceSystemIssues(fixtureIsraeliSystem())).toEqual([]);
    expect(sourceSystemIssues(fixtureSystem({ sourceSystemId: 'Bad Id' }))).toContainEqual(
      expect.stringContaining('invalid sourceSystemId'),
    );
    expect(sourceSystemIssues(fixtureSystem({ manufacturers: [] }))).toContainEqual(
      expect.stringContaining('no manufacturer'),
    );
    expect(
      sourceSystemIssues(
        fixtureSystem({ sourceType: 'D_RESTRICTED_OR_UNAVAILABLE', adapterId: 'x' }),
      ),
    ).toContainEqual(expect.stringContaining('no retrieval adapter'));
    expect(
      sourceSystemIssues(
        fixtureSystem({
          discovery: {
            mechanism: 'static_links',
            entryPoints: [{ kind: 'listing', url: 'https://elsewhere.example/list' }],
          },
        }),
      ),
    ).toContainEqual(expect.stringContaining('outside the system'));
    expect(sourceSystemIssues(fixtureSystem({ adapterId: 'nope' }), ['listing'])).toContainEqual(
      expect.stringContaining('unknown adapter'),
    );
  });

  it('Israeli vs global: only an Israeli importer/manufacturer system can be official for IL', () => {
    expect(sourceSystemIssues(fixtureSystem({ market: 'IL' }))).toContainEqual(
      expect.stringContaining('global system cannot claim the Israeli market'),
    );
    expect(sourceSystemIssues(fixtureIsraeliSystem({ market: 'EU' }))).toContainEqual(
      expect.stringContaining('market IL'),
    );
    expect(
      sourceSystemIssues(fixtureIsraeliSystem({ authorityClass: 'manufacturer_library' })),
    ).toContainEqual(expect.stringContaining('importer or the manufacturer'));
    expect(sourceSystemIssues(fixtureIsraeliSystem({ importer: undefined }))).toContainEqual(
      expect.stringContaining('importer name missing'),
    );
  });

  it('source type (A–D) and evidence level (A–E) are different types that never convert', () => {
    const type: SourceSystemType = 'A_DIRECT_MAINTENANCE_SCHEDULE';
    const levels: EvidenceLevel[] = ['A', 'B', 'C', 'D', 'E'];
    // A source TYPE is a label of the system, never a valid evidence LEVEL (and vice versa).
    expect(levels).not.toContain(type as unknown as EvidenceLevel);
    expect([
      'A_DIRECT_MAINTENANCE_SCHEDULE',
      'B_DIGITAL_MANUAL',
      'C_STRUCTURED_WEB_MANUAL',
      'D_RESTRICTED_OR_UNAVAILABLE',
    ]).not.toContain('A');
  });

  it('the most specific domain decides the system', () => {
    const systems = [fixtureSystem(), fixtureIsraeliSystem()];
    expect(systemForHost('il.synthetic.example', systems)?.sourceSystemId).toBe('il-synthmoto');
    expect(systemForHost('cdn.synthetic.example', systems)?.sourceSystemId).toBe(
      'global-synthmoto',
    );
    expect(systemForHost('synthetic.example.evil.io', systems)).toBeNull();
  });
});

describe('Step 3 — access policy semantics', () => {
  it('1. discovery ALLOWED + automated fetch UNKNOWN: listing pages yes, documents no', async () => {
    const s = fixtureSystem({}, 'UNKNOWN', { discoveryAllowed: 'ALLOWED' });
    expect(
      (await accessDecision('https://synthetic.example/manuals', ctx([s]), 'discovery')).ok,
    ).toBe(true);
    expect(
      await accessDecision('https://synthetic.example/m.pdf', ctx([s]), 'fetch'),
    ).toMatchObject({
      ok: false,
      blocked: { reason: 'policy_unknown', detail: 'automatedFetchAllowed' },
    });
  });

  it('2. fetch ALLOWED + redistribution NOT_ALLOWED: fetching is not blocked by redistribution', async () => {
    const s = fixtureSystem({}, 'ALLOWED', { documentRedistributionAllowed: 'NOT_ALLOWED' });
    expect((await accessDecision('https://synthetic.example/m.pdf', ctx([s]), 'fetch')).ok).toBe(
      true,
    );
    expect(permits(currentPolicy(s.policy), 'documentRedistributionAllowed')).toBe(false);
  });

  it('3. automated extraction REQUIRES_PERMISSION: never permitted, needs terms evidence', () => {
    const p = fixturePolicy('ALLOWED', { automatedExtractionAllowed: 'REQUIRES_PERMISSION' });
    expect(permits(p, 'automatedExtractionAllowed')).toBe(false);
    expect(policyIssues(p)).toEqual([]);
    const noEvidence = policy(D, [], {
      automatedExtractionAllowed: { value: 'REQUIRES_PERMISSION', basis: [] },
    });
    expect(policyIssues(noEvidence)).toContainEqual(
      expect.stringContaining('REQUIRES_PERMISSION needs terms evidence'),
    );
  });

  it('4. document caching NOT_ALLOWED while structured facts storage ALLOWED', () => {
    const p = policy(D, [terms('t', 'no storing copies of the documents'), owner], {
      documentCachingAllowed: { value: 'NOT_ALLOWED', basis: ['t'] },
      structuredFactsStorageAllowed: { value: 'ALLOWED', basis: ['owner'] },
    });
    expect(policyIssues(p)).toEqual([]);
    expect(permits(p, 'documentCachingAllowed')).toBe(false);
    expect(permits(p, 'structuredFactsStorageAllowed')).toBe(true);
  });

  it('5. unknown terms stay UNKNOWN; "no terms found" can never become ALLOWED', () => {
    const none: PolicyEvidence = { id: 'n', kind: 'none_found', reviewedAt: D, reviewedBy: 'test' };
    const p = policy(D, [none], {});
    expect(Object.values(p.dimensions).every((d) => d.value === 'UNKNOWN')).toBe(true);
    const bad = policy(D, [none], { automatedFetchAllowed: { value: 'ALLOWED', basis: ['n'] } });
    expect(policyIssues(bad).join(' ')).toMatch(/explicit permission evidence|absence of terms/);
  });

  it('6. robots.txt alone cannot populate a legal dimension', () => {
    const technicalOk = policy(D, [robots], {
      discoveryAllowed: { value: 'UNKNOWN', basis: ['robots'] },
    });
    expect(policyIssues(technicalOk)).toEqual([]);
    const legalFromRobots = policy(D, [robots], {
      structuredFactsStorageAllowed: { value: 'ALLOWED', basis: ['robots'] },
    });
    expect(policyIssues(legalFromRobots).join(' ')).toMatch(
      /technical signal cannot decide a legal dimension/,
    );
    const fetchFromRobots = policy(D, [robots], {
      automatedFetchAllowed: { value: 'ALLOWED', basis: ['robots'] },
    });
    // robots "Allow" is not permission either: ALLOWED needs legal permission evidence.
    expect(policyIssues(fetchFromRobots).join(' ')).toMatch(/explicit permission evidence/);
    // A robots "Disallow" CAN make the technical dimensions NOT_ALLOWED.
    const disallowed = policy(D, [robots], {
      automatedFetchAllowed: { value: 'NOT_ALLOWED', basis: ['robots'] },
    });
    expect(policyIssues(disallowed)).toEqual([]);
  });

  it('7. policy evidence is attached per dimension and reviewable later', () => {
    const p = policy(D, [terms('t1', 'no crawlers, robots or automated retrieval')], {
      discoveryAllowed: { value: 'NOT_ALLOWED', basis: ['t1'], note: 'crawlers banned' },
      automatedFetchAllowed: { value: 'NOT_ALLOWED', basis: ['t1'] },
    });
    expect(policyIssues(p)).toEqual([]);
    const cited = p.dimensions.discoveryAllowed.basis.map((id) =>
      p.evidence.find((e) => e.id === id),
    );
    expect(cited[0]).toMatchObject({ url: 'https://synthetic.example/terms', reviewedAt: D });
    expect(
      policyIssues(
        policy(D, [], { discoveryAllowed: { value: 'NOT_ALLOWED', basis: ['missing'] } }),
      ),
    ).toContainEqual(expect.stringContaining('unknown evidence reference'));
  });

  it('8. a policy change is a new version; earlier versions and evidence are kept', () => {
    const v1 = policy(D, [], {});
    const v2 = policy(
      '2026-10-15' as typeof D,
      [
        {
          id: 'perm',
          kind: 'written_permission',
          quote: 'written permission (synthetic)',
          reviewedAt: D,
          reviewedBy: 'owner',
        },
      ],
      { automatedFetchAllowed: { value: 'ALLOWED', basis: ['perm'] } },
      2,
    );
    const h = revisePolicy({ versions: [v1] }, v2);
    expect(h.versions).toHaveLength(2);
    expect(h.versions[0].dimensions.automatedFetchAllowed.value).toBe('UNKNOWN');
    expect(currentPolicy(h).dimensions.automatedFetchAllowed.value).toBe('ALLOWED');
    expect(() => revisePolicy(h, { ...v2, version: 2 })).toThrow('increase by one');
  });

  it('no implicit propagation: permitting one activity never permits another', async () => {
    const s = fixtureSystem({}, 'UNKNOWN', { automatedFetchAllowed: 'ALLOWED' });
    expect((await accessDecision('https://synthetic.example/m.pdf', ctx([s]), 'fetch')).ok).toBe(
      true,
    );
    expect((await accessDecision('https://synthetic.example/list', ctx([s]), 'discovery')).ok).toBe(
      false,
    );
    const p = currentPolicy(s.policy);
    for (const d of [
      'automatedExtractionAllowed',
      'documentCachingAllowed',
      'structuredFactsStorageAllowed',
      'documentRedistributionAllowed',
    ] as const) {
      expect(permits(p, d)).toBe(false);
    }
  });
});
