import type {
  DocumentId,
  Evidence,
  IdGenerator,
  MaintenanceInterval,
  MaintenanceItem,
  NewScheduleInput,
  ServiceDraft,
  SourceId,
  VehicleId,
} from '@/domain';
import type { DocumentCoverage } from '@/discovery/types';

import { groundQuote } from './evidence';
import { wrapUntrusted } from './injection';
import type { DocumentInput, InjectionFlag, OcrProvider, StructuredExtractor } from './ports';
import {
  invoiceExtractionSchema,
  maintenanceExtractionSchema,
  parseUntrusted,
  type EvidenceRef,
} from './schemas';

/**
 * T091: confidence & verification pipeline.
 *   original → OCR → wrap as untrusted data → AI proposal → schema validation → grounding of every
 *   fact against the original text → confidence thresholds → domain input.
 * The domain (createSchedule) then DECIDES verification from source authority + applicability.
 * Flags from injection detection force the result into review and block automatic verification.
 */

export const ACCEPT_CONFIDENCE = 0.9;
export const MIN_CONFIDENCE = 0.6;

export interface DroppedFact {
  what: string;
  reason: 'not_grounded' | 'low_confidence';
  page: number;
}

export type ScheduleExtractionResult =
  | {
      status: 'ok';
      /** Ready for domain createSchedule (verification decided there). */
      input: NewScheduleInput;
      coverage: DocumentCoverage;
      dropped: DroppedFact[];
      flags: InjectionFlag[];
      reviewRequired: boolean;
    }
  | {
      status: 'failed';
      reason: 'ocr_failed' | 'extraction_failed' | 'invalid_output' | 'nothing_grounded';
      detail?: string[];
    };

export interface ScheduleExtractionDeps {
  ocr: OcrProvider;
  extractor: StructuredExtractor;
  ids: IdGenerator;
}

/**
 * @param sourceEvidence evidence from discovery (authority + exact applicability of the SOURCE);
 *   this pipeline can only weaken it (flags), never strengthen it.
 */
export async function extractMaintenanceSchedule(
  vehicleId: VehicleId,
  document: DocumentInput & { documentId: DocumentId; sourceId: SourceId },
  sourceEvidence: Evidence,
  deps: ScheduleExtractionDeps,
): Promise<ScheduleExtractionResult> {
  let ocr;
  try {
    ocr = await deps.ocr.recognize(document, { languages: ['he', 'en'] });
  } catch {
    return { status: 'failed', reason: 'ocr_failed' };
  }
  const content = wrapUntrusted(ocr);
  let raw: unknown;
  try {
    raw = await deps.extractor.extract('maintenance_schedule', content);
  } catch {
    return { status: 'failed', reason: 'extraction_failed' };
  }
  const parsed = parseUntrusted(maintenanceExtractionSchema, raw);
  if (!parsed.ok) return { status: 'failed', reason: 'invalid_output', detail: parsed.errors };

  const dropped: DroppedFact[] = [];
  let lowConfidenceKept = false;
  const grounded = (ref: EvidenceRef) => groundQuote(content.pages, ref).grounded;
  const reference = (ref: EvidenceRef) => ({
    sourceId: document.sourceId,
    documentId: document.documentId,
    page: ref.page,
    section: ref.section,
    table: ref.table,
    quote: ref.quote,
  });

  const intervals: MaintenanceInterval[] = [];
  for (const iv of parsed.value.intervals) {
    if (!grounded(iv.evidence)) {
      dropped.push({
        what: `interval:${iv.label}`,
        reason: 'not_grounded',
        page: iv.evidence.page,
      });
      continue;
    }
    const items: MaintenanceItem[] = [];
    for (const it of iv.items) {
      if (it.confidence < MIN_CONFIDENCE) {
        dropped.push({ what: it.title, reason: 'low_confidence', page: it.evidence.page });
        continue;
      }
      if (!grounded(it.evidence)) {
        dropped.push({ what: it.title, reason: 'not_grounded', page: it.evidence.page });
        continue;
      }
      if (it.confidence < ACCEPT_CONFIDENCE) lowConfidenceKept = true;
      items.push({
        id: deps.ids.next<'MaintenanceItem'>(),
        title: it.title,
        actionType: it.actionType,
        manufacturerText: it.manufacturerText,
        reference: reference(it.evidence),
      });
    }
    if (items.length === 0) continue;
    intervals.push({
      id: deps.ids.next<'Interval'>(),
      label: iv.label,
      rule: iv.rule,
      everyKm: iv.everyKm,
      everyMonths: iv.everyMonths,
      firstAtKm: iv.firstAtKm,
      firstAtMonths: iv.firstAtMonths,
      items,
    });
  }
  if (intervals.length === 0) return { status: 'failed', reason: 'nothing_grounded' };

  const flagged =
    content.flags.includes('instruction_like_text') || content.flags.includes('role_markers');
  const { evidence: _coverageEvidence, ...coverage } = parsed.value.coverage;
  return {
    status: 'ok',
    input: {
      vehicleId,
      intervals,
      // A suspicious document can never auto-verify: exact applicability is withheld.
      evidence: [
        { ...sourceEvidence, exactApplicability: sourceEvidence.exactApplicability && !flagged },
      ],
      applicability: { matchedOn: [], exact: sourceEvidence.exactApplicability && !flagged },
    },
    coverage,
    dropped,
    flags: content.flags,
    reviewRequired: flagged || dropped.length > 0 || lowConfidenceKept,
  };
}

// ---------- T093: invoice → draft ONLY ----------

export type InvoiceDraftResult =
  | { status: 'draft'; draft: ServiceDraft; uncertain: string[]; flags: InjectionFlag[] }
  | { status: 'failed'; reason: 'ocr_failed' | 'extraction_failed' | 'invalid_output' };

/**
 * Produces an editable ServiceDraft. It is NEVER confirmed here — only the user's explicit
 * confirmation (domain confirmServiceDraft) can turn it into history (invariants 7/8).
 */
export async function extractInvoiceDraft(
  vehicleId: VehicleId,
  document: DocumentInput & { documentId: DocumentId },
  deps: { ocr: OcrProvider; extractor: StructuredExtractor },
): Promise<InvoiceDraftResult> {
  let ocr;
  try {
    ocr = await deps.ocr.recognize(document, { languages: ['he', 'en'] });
  } catch {
    return { status: 'failed', reason: 'ocr_failed' };
  }
  const content = wrapUntrusted(ocr);
  let raw: unknown;
  try {
    raw = await deps.extractor.extract('invoice', content);
  } catch {
    return { status: 'failed', reason: 'extraction_failed' };
  }
  const parsed = parseUntrusted(invoiceExtractionSchema, raw);
  if (!parsed.ok) return { status: 'failed', reason: 'invalid_output' };
  const x = parsed.value;
  const uncertain: string[] = [];
  const check = <T>(
    field: string,
    v?: { value: T; confidence: number; evidence?: EvidenceRef },
  ) => {
    if (!v) return undefined;
    if (v.confidence < MIN_CONFIDENCE) {
      uncertain.push(field);
      return undefined; // too unsure to prefill — the user enters it
    }
    if (
      v.confidence < ACCEPT_CONFIDENCE ||
      (v.evidence && !groundQuote(content.pages, v.evidence).grounded)
    ) {
      uncertain.push(field);
    }
    return v.value;
  };
  const date = check('date', x.date);
  const odometer = check('odometer', x.odometerKm);
  const garage = check('garage', x.garageName);
  const actions = x.lines.map((l, i) => {
    if (l.confidence < ACCEPT_CONFIDENCE || !l.actionType) uncertain.push(`line:${i}`);
    return {
      title: l.description,
      actionType: l.actionType ?? ('other' as const),
      // An invoice line proposes work that was performed; the user confirms each checkbox.
      performed: l.confidence >= MIN_CONFIDENCE,
      maintenanceItemId: null,
      unlisted: true,
    };
  });
  if (content.flags.length > 0) uncertain.push('document_flagged');
  return {
    status: 'draft',
    draft: {
      vehicleId,
      origin: 'document',
      date: date ?? '',
      odometerKm: odometer ?? null,
      garageName: garage ?? '',
      notes: '',
      actions,
      documentIds: [document.documentId],
      extractionId: null,
    },
    uncertain,
    flags: content.flags,
  };
}
