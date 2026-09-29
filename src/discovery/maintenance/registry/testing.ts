import type { IsoDate } from '@/domain';

import {
  POLICY_DIMENSIONS,
  policy,
  type PolicyDimension,
  type PolicyEvidence,
  type PolicyValue,
} from './policy';
import type { SourceSystem } from './sourceSystem';

/**
 * SYNTHETIC source-system fixtures for tests only (fictional make "Synthmoto" on the fictional
 * host synthetic.example). Never part of the real registry.
 */
export const FIXTURE_DATE = '2026-09-30' as IsoDate;

const EVIDENCE: PolicyEvidence[] = [
  {
    id: 'owner',
    kind: 'owner_decision',
    quote: 'synthetic test permission',
    reviewedAt: FIXTURE_DATE,
    reviewedBy: 'test',
  },
  {
    id: 'terms',
    kind: 'terms',
    url: 'https://synthetic.example/terms',
    quote: 'no automated retrieval',
    reviewedAt: FIXTURE_DATE,
    reviewedBy: 'test',
  },
];

/** A policy with every dimension set to `all`, then `set` applied (evidence chosen to be valid). */
export function fixturePolicy(
  all: PolicyValue,
  set: Partial<Record<PolicyDimension, PolicyValue>> = {},
) {
  const basisFor = (v: PolicyValue) =>
    v === 'ALLOWED' ? ['owner'] : v === 'UNKNOWN' ? [] : ['terms'];
  return policy(
    FIXTURE_DATE,
    EVIDENCE,
    Object.fromEntries(
      POLICY_DIMENSIONS.map((d) => {
        const v = set[d] ?? all;
        return [d, { value: v, basis: basisFor(v) }];
      }),
    ) as Record<PolicyDimension, { value: PolicyValue; basis: string[] }>,
  );
}

export function fixtureSystem(
  over: Partial<SourceSystem> = {},
  access: PolicyValue = 'ALLOWED',
  set: Partial<Record<PolicyDimension, PolicyValue>> = {},
): SourceSystem {
  return {
    sourceSystemId: 'global-synthmoto',
    manufacturers: ['synthmoto'],
    vehicleKinds: ['car', 'motorcycle'],
    market: 'GLOBAL',
    region: 'global',
    origin: 'global',
    domains: [{ host: 'synthetic.example', role: 'site' }],
    sourceType: 'B_DIGITAL_MANUAL',
    authorityClass: 'manufacturer',
    discovery: {
      mechanism: 'static_links',
      entryPoints: [
        { kind: 'listing', url: 'https://synthetic.example/manuals', documents: '[.](pdf|html)$' },
      ],
    },
    documentCategories: ['owner_manual'],
    policy: { versions: [fixturePolicy(access, set)] },
    status: 'approved',
    authorityEvidence: 'synthetic fixture',
    limitations: [],
    applicabilityResolution: 'automatic',
    ...over,
  };
}

/** An Israeli importer fixture on il.synthetic.example. */
export function fixtureIsraeliSystem(over: Partial<SourceSystem> = {}): SourceSystem {
  return fixtureSystem({
    sourceSystemId: 'il-synthmoto',
    importer: 'Synthmoto Israel Ltd (fictional)',
    market: 'IL',
    region: 'Israel',
    origin: 'israeli',
    authorityClass: 'importer',
    domains: [{ host: 'il.synthetic.example', role: 'site' }],
    discovery: {
      mechanism: 'static_links',
      entryPoints: [
        { kind: 'listing', url: 'https://il.synthetic.example/list', documents: '[.](pdf|html)$' },
      ],
    },
    ...over,
  });
}
