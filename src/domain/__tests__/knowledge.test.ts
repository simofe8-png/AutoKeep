import {
  claimIssues,
  confirmOwnership,
  documentFromUpload,
  isoDate,
  isVerifiedRequirement,
  matchOfficialEdition,
  narrowApplicability,
  requirementFromClaim,
  reviewClaim,
  sharingPolicy,
  type CandidateClaim,
  type IsoDate,
  type KnowledgeDocument,
} from '@/domain';
import { resolveRequirements } from '@/engine/requirements';

/** Task 6: document → claim → requirement. All intervals here are SYNTHETIC test values. */
const D = (s: string) => isoDate(s) as IsoDate;
const SHA = 'a'.repeat(64);

const upload = () =>
  documentFromUpload({
    id: 'doc-upload',
    vehicleId: 'veh-1',
    title: 'My service booklet (photos)',
    sha256: SHA,
    claimedAuthority: 'vehicle_document',
  });

const edition: KnowledgeDocument = {
  id: 'edition-1',
  vehicleId: null,
  origin: 'catalog_edition',
  title: 'SYNTHETIC maintenance booklet edition',
  authority: 'manufacturer',
  markets: ['IL'],
  edition: 'synthetic-1',
  sha256: SHA,
  authenticity: 'curator_verified',
  rights: 'structured_facts_only',
  excerptPolicy: 'none',
  coverage: { makes: ['SyntheticMake'], modelYears: { from: 2010, to: 2014 } },
};

const claim = (over: Partial<CandidateClaim> = {}): CandidateClaim => ({
  id: 'claim-1',
  documentId: 'doc-upload',
  vehicleId: 'veh-1',
  task: 'brake_fluid',
  action: 'replacement',
  interval: { everyMonths: 99, rule: 'time_only', repeats: true }, // SYNTHETIC
  applicability: {},
  locator: { page: 7, table: 'service schedule' },
  extraction: { method: 'user_entered', by: 'owner', at: D('2026-09-29') },
  status: 'candidate',
  ...over,
});

describe('uploads are a normal input but never authoritative by themselves', () => {
  it('an upload is private, unconfirmed and not redistributable', () => {
    const d = upload();
    expect(d).toMatchObject({ origin: 'user_upload', authenticity: 'unconfirmed', rights: 'none' });
    expect(sharingPolicy(d)).toEqual({ shareBinary: false, shareStructuredFacts: false });
  });

  it('owner confirmation says "this is my booklet" — it verifies nothing', () => {
    const d = confirmOwnership(upload(), D('2026-09-29'));
    expect(d.authenticity).toBe('owner_confirmed');
    const r = requirementFromClaim(
      reviewClaim(claim(), {
        by: 'owner',
        role: 'owner',
        at: D('2026-09-29'),
        decision: 'accepted',
      }),
      d,
    );
    expect(r.verification).toBe('candidate');
    expect(isVerifiedRequirement(r)).toBe(false);
    const [res] = resolveRequirements([r], { make: 'SyntheticMake', market: 'IL' });
    expect(res.status).toBe('unverified_only');
  });

  it('a claim without an exact location is not evidence', () => {
    expect(claimIssues(claim({ locator: {} }))).toContain('no exact location in the document');
  });
});

describe('authentic edition + curator review → verified, traceable requirement', () => {
  const matched = matchOfficialEdition(confirmOwnership(upload(), D('2026-09-29')), [edition]);
  const accepted = reviewClaim(claim({ excerpt: 'a short line from the page' }), {
    by: 'curator-1',
    role: 'curator',
    at: D('2026-09-30'),
    decision: 'accepted',
  });

  it('the fingerprint match inherits the edition authority, markets and coverage', () => {
    expect(matched.edition?.id).toBe('edition-1');
    expect(matched.document).toMatchObject({
      authenticity: 'matched_official_edition',
      authority: 'manufacturer',
      markets: ['IL'],
      vehicleId: 'veh-1',
    });
  });

  it('becomes verified with evidence: document, edition, page, table, fingerprint', () => {
    const r = requirementFromClaim(accepted, matched.document);
    expect(r.verification).toBe('verified');
    expect(isVerifiedRequirement(r)).toBe(true);
    expect(r.authority).toBe('manufacturer');
    expect(r.evidence[0]).toMatchObject({
      documentId: 'doc-upload',
      edition: 'synthetic-1',
      page: 7,
      table: 'service schedule',
      documentSha256: SHA,
      markets: ['IL'],
    });
    // Terms do not allow excerpts for this edition: structured facts only.
    expect(r.evidence[0].excerpt).toBeUndefined();
    expect(r.extraction.reviewedBy).toBe('curator-1');
  });

  it('a curator acceptance on an unauthenticated upload is still not verified', () => {
    expect(requirementFromClaim(accepted, upload()).verification).toBe('candidate');
  });

  it('the claim narrows the document coverage but can never widen it', () => {
    const r = requirementFromClaim(
      { ...accepted, applicability: { modelYears: { from: 2005, to: 2012 }, engineCodes: ['X1'] } },
      matched.document,
    );
    expect(r.applicability).toMatchObject({
      makes: ['SyntheticMake'],
      modelYears: { from: 2010, to: 2012 },
      engineCodes: ['X1'],
      markets: ['IL'],
    });
    expect(narrowApplicability({ makes: ['A'] }, { makes: ['B'] }).makes).toEqual([]);
  });

  it('the user upload itself is never redistributed; a curated edition shares facts only', () => {
    expect(sharingPolicy(matched.document).shareBinary).toBe(false);
    expect(sharingPolicy(edition)).toEqual({ shareBinary: false, shareStructuredFacts: true });
  });
});
