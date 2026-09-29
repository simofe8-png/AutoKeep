import { isoDate, isVerifiedRequirement, type MaintenanceRequirement } from '..';
import { reviewChecklist, reviewRequirement, ReviewError, type ReviewInput } from '../review';

/** M-SOURCE Step 11 — requirement-level reviewer (SYNTHETIC requirement). */
const AT = isoDate('2026-09-30');
const candidate: MaintenanceRequirement = {
  id: 'synthetic-oil',
  task: 'engine_oil',
  taskText: 'Engine oil',
  action: 'replacement',
  interval: {
    every: { value: 10000, unit: 'km' },
    everyMonths: 12,
    first: { value: 1000, unit: 'km' },
    rule: 'whichever_first',
    repeats: true,
    anchor: 'zero',
  },
  applicability: { makes: ['synthmoto'], models: ['SX 125'], usage: 'normal' },
  authority: 'manufacturer',
  evidence: [
    {
      documentId: 'd',
      documentTitle: 'SYNTHETIC manual',
      authority: 'manufacturer',
      markets: ['EU'],
      page: 28,
      table: 'Periodic maintenance',
      locator: 'row "Engine oil"',
      documentSha256: 'a'.repeat(64),
    },
  ],
  verification: 'candidate',
  extraction: { method: 'ai_candidate', by: 'extractor', at: AT },
};
const input: ReviewInput = {
  requirement: candidate,
  evidenceLevel: 'E',
  conflicts: [],
  unresolved: ['modelYear'],
};
const curator = { reviewer: 'r1', role: 'curator' as const, at: AT, reason: 'matches p.28 row' };

describe('requirement reviewer', () => {
  it('shows everything the decision needs', () => {
    expect(reviewChecklist(input)).toMatchObject({
      item: 'engine_oil',
      action: 'replacement',
      distance: { value: 10000, unit: 'km' },
      time: 12,
      rule: 'whichever_first',
      first: { distance: { value: 1000, unit: 'km' } },
      repeats: true,
      anchor: 'zero',
      severe: 'normal',
      source: { page: 28, table: 'Periodic maintenance', sha256: 'a'.repeat(64) },
      publisher: 'manufacturer',
      market: ['EU'],
      evidenceLevel: 'E',
      unresolved: ['modelYear'],
    });
  });

  it('APPROVE: the same requirement becomes verified, with the reviewer recorded', () => {
    const { requirement, record } = reviewRequirement(input, 'APPROVE', curator);
    expect(requirement.verification).toBe('verified');
    expect(requirement.extraction.reviewedBy).toBe('curator:r1');
    expect(isVerifiedRequirement(requirement)).toBe(true);
    expect(requirement.interval).toEqual(candidate.interval);
    expect(record).toMatchObject({ decision: 'APPROVE', requirementId: 'synthetic-oil' });
  });

  it('CORRECT: a new verified requirement; the original stays in the audit record', () => {
    const { requirement, record } = reviewRequirement(
      input,
      'CORRECT',
      { ...curator, reason: 'the page says 15,000 km' },
      {
        interval: { ...candidate.interval, every: { value: 15000, unit: 'km' } },
      },
    );
    expect(requirement.id).not.toBe(candidate.id);
    expect(requirement.interval.every).toEqual({ value: 15000, unit: 'km' });
    expect(isVerifiedRequirement(requirement)).toBe(true);
    expect(record.original).toBe(candidate);
    expect(() => reviewRequirement(input, 'CORRECT', curator)).toThrow('corrected fields');
  });

  it('REJECT: never verified', () => {
    const { requirement } = reviewRequirement(input, 'REJECT', {
      ...curator,
      reason: 'not on the page',
    });
    expect(requirement.verification).toBe('rejected');
    expect(isVerifiedRequirement(requirement)).toBe(false);
  });

  it('the vehicle owner cannot verify; unlocated or non-computable requirements cannot be approved', () => {
    expect(() => reviewRequirement(input, 'APPROVE', { ...curator, role: 'owner' })).toThrow(
      ReviewError,
    );
    const unlocated = {
      ...input,
      requirement: {
        ...candidate,
        evidence: [{ ...candidate.evidence[0], documentSha256: undefined }],
      },
    };
    expect(() => reviewRequirement(unlocated, 'APPROVE', curator)).toThrow('identified document');
    const broken = {
      ...input,
      requirement: { ...candidate, interval: { ...candidate.interval, every: undefined } },
    };
    expect(() => reviewRequirement(broken, 'APPROVE', curator)).toThrow('not computable');
    expect(() => reviewRequirement(input, 'APPROVE', { ...curator, reason: ' ' })).toThrow(
      'reason',
    );
  });

  it('a review verifies evidence, not applicability: an unresolved dimension stays unresolved', () => {
    const { requirement } = reviewRequirement(input, 'APPROVE', curator);
    expect(requirement.applicability).toEqual(candidate.applicability);
  });
});
