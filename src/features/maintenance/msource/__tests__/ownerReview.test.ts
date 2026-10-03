import {
  ownerDocumentRequirement,
  uploadIssues,
  type OwnerProposal,
} from '@/discovery/maintenance/msource/ownerReview';
import type { EvidenceRecord } from '@/discovery/maintenance/msource/types';
import {
  isoDate,
  isVerifiedRequirement,
  type IsoDate,
  type MaintenanceRequirement,
} from '@/domain';

import { validateOwnerEdit } from '../ownerReview';

/** Owner corrections and unreadable uploads (SYNTHETIC values). */

const proposal: OwnerProposal = {
  key: 'abcdef0123456789:engine_oil:replacement:normal:20000:12:',
  evidenceId: 'ev-1',
  documentId: 'doc-1',
  documentName: 'booklet.pdf',
  documentSha256: 'a'.repeat(64),
  task: 'engine_oil',
  action: 'replacement',
  condition: 'normal',
  intervalKm: 20000,
  intervalMonths: 12,
  rule: 'WHICHEVER_COMES_FIRST',
  page: 7,
  excerpt: 'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
  fit: 'matched',
};

const base: MaintenanceRequirement = {
  id: 'r',
  task: 'engine_oil',
  action: 'replacement',
  interval: {
    every: { value: 20000, unit: 'km' },
    everyMonths: 12,
    rule: 'whichever_first',
    repeats: true,
  },
  applicability: {},
  authority: 'secondary',
  evidence: [{ documentId: 'x', documentTitle: 'x', authority: 'secondary', markets: [] }],
  verification: 'candidate',
  extraction: { method: 'deterministic_parser', by: 't', at: isoDate('2026-10-03') as IsoDate },
};
const evidence = {
  id: 'ev-1',
  requirement: base,
  sourceLocation: { page: 7, locator: 'p1' },
} as unknown as EvidenceRecord;
const DAY = isoDate('2026-10-03') as IsoDate;

describe('validateOwnerEdit', () => {
  it('accepts km and/or months; separators allowed; empty description keeps the document words', () => {
    expect(validateOwnerEdit({ km: '15,000', months: '', text: ' ' }, 'doc words')).toEqual({
      ok: true,
      edit: { intervalKm: 15000, intervalMonths: null, text: 'doc words' },
    });
    expect(validateOwnerEdit({ km: '', months: '24', text: 'Brake fluid' }, 'x')).toEqual({
      ok: true,
      edit: { intervalKm: null, intervalMonths: 24, text: 'Brake fluid' },
    });
  });

  it('rejects non-numbers, out-of-range values, no interval, an over-long description', () => {
    expect(validateOwnerEdit({ km: '15k', months: '', text: '' }, 'x')).toMatchObject({
      ok: false,
      errors: { km: true },
    });
    expect(validateOwnerEdit({ km: '50', months: '300', text: '' }, 'x')).toMatchObject({
      ok: false,
      errors: { km: true, months: true },
    });
    expect(validateOwnerEdit({ km: '', months: '', text: '' }, 'x')).toMatchObject({
      ok: false,
      errors: { interval: true },
    });
    expect(validateOwnerEdit({ km: '1000', months: '', text: 'y'.repeat(201) }, 'x')).toMatchObject(
      { ok: false, errors: { text: true } },
    );
  });
});

describe('ownerDocumentRequirement', () => {
  it('as read: grounded parser output, owner-reviewed, verified', () => {
    const r = ownerDocumentRequirement(proposal, evidence, 'msource/1', DAY);
    expect(r.extraction).toMatchObject({ method: 'deterministic_parser', grounded: true });
    expect(r.extraction.ownerEdit).toBeUndefined();
    expect(isVerifiedRequirement(r)).toBe(true);
  });

  it('an edit identical to the reading is no edit', () => {
    const same = { intervalKm: 20000, intervalMonths: 12, text: proposal.excerpt };
    const r = ownerDocumentRequirement(proposal, evidence, 'msource/1', DAY, same);
    expect(r.extraction.method).toBe('deterministic_parser');
  });

  it('edited: entered by the owner, original reading kept, interval and description replaced', () => {
    const r = ownerDocumentRequirement(proposal, evidence, 'msource/1', DAY, {
      intervalKm: 15000,
      intervalMonths: null,
      text: 'Oil + filter',
    });
    expect(r.extraction).toMatchObject({
      method: 'user_entered',
      by: 'owner',
      reviewedBy: 'owner',
      ownerEdit: {
        original: { intervalKm: 20000, intervalMonths: 12, text: proposal.excerpt },
      },
    });
    expect(r.extraction.grounded).toBeUndefined();
    expect(r.interval).toEqual({
      every: { value: 15000, unit: 'km' },
      rule: 'distance_only',
      repeats: true,
    });
    expect(r.taskText).toBe('Oil + filter');
    // The document reference (page, the document's own words) is unchanged.
    expect(r.evidence[0]).toMatchObject({ page: 7, excerpt: proposal.excerpt });
    expect(r.authority).toBe('vehicle_document');
    expect(isVerifiedRequirement(r)).toBe(true);
  });
});

describe('uploadIssues', () => {
  it('reports an upload without a text layer (scanned) by name; nothing else', () => {
    expect(
      uploadIssues([
        { candidate: { upload: { name: 'scan.pdf' } }, failure: { code: 'NO_TEXT_LAYER' } },
        { candidate: { upload: { name: 'ok.pdf' } } },
        { candidate: {}, failure: { code: 'NO_TEXT_LAYER' } },
      ]),
    ).toEqual([{ documentName: 'scan.pdf', reason: 'no_text' }]);
  });
});
