import {
  createDocument,
  decideVerification,
  newMeta,
  type DocumentId,
  type Evidence,
  type IdGenerator,
  type NewScheduleInput,
  type Source,
  type SourceId,
  type Timestamp,
  type VehicleDocument,
  type VehicleId,
} from '@/domain';
import type { ManufacturerAliases, OfficialDomainEntry } from '@/discovery/authority';
import type { CuratedSchedule, KnownOfficialDocument } from '@/discovery/hybrid';
import { discoverOfficialSource, type DiscoveryStep } from '@/discovery/pipeline';
import type { FetchedFile, Retriever } from '@/discovery/retrieval';
import type { DiscoveryProvider, VehicleIdentityQuery } from '@/discovery/types';
import { extractMaintenanceSchedule, type ScheduleExtractionResult } from '@/intelligence/pipeline';
import type { OcrProvider, StructuredExtractor } from '@/intelligence/ports';

/**
 * Official source → verified schedule, wired into the app (T170). Orchestration only: discovery,
 * authority, applicability and retrieval are M10; reading coverage and the schedule is M11 (OCR/AI
 * ports, grounding, injection flags); verification is decided by the domain (createSchedule).
 * The result is a PLAN, persisted together with the vehicle — nothing is stored if the user leaves.
 * Without a configured discovery provider (G1: none approved yet) the honest result is not_found.
 */

export interface SourceServices {
  discovery: DiscoveryProvider | null;
  retriever: Retriever | null;
  registry: readonly OfficialDomainEntry[];
  aliases: ManufacturerAliases;
  reader: { ocr: OcrProvider; extractor: StructuredExtractor } | null;
  /** Human-curated, hash-pinned schedules from the verified registry (zero-cost path, G3). */
  curated?: readonly KnownOfficialDocument[];
  /** Local URI of a retrieved original (for OCR). */
  uriFor: (storageKey: string) => string;
}

export type SourcePlan =
  | { status: 'not_found' }
  | {
      status: 'verified' | 'pending';
      document: VehicleDocument;
      source: Source;
      /** Null when the official document yielded no grounded schedule. */
      schedule: NewScheduleInput | null;
    };

const PLACEHOLDER: Evidence = { authority: 'manufacturer', exactApplicability: false };

export async function planOfficialSource(
  vehicleId: VehicleId,
  identity: VehicleIdentityQuery,
  services: SourceServices,
  ids: IdGenerator,
  now: () => Timestamp,
  onStep?: (step: DiscoveryStep) => void,
): Promise<SourcePlan> {
  const { discovery, retriever, reader } = services;
  const curatedDocs = (services.curated ?? []).filter((d) => d.curated);
  if (!discovery || !retriever || (!reader && curatedDocs.length === 0)) {
    onStep?.('discovery');
    return { status: 'not_found' };
  }
  // Document verification for curated entries: the retrieved bytes must be EXACTLY the pinned
  // document the person transcribed (same SHA-256); anything else is not that document.
  const curatedFor = (file: FetchedFile): CuratedSchedule | null =>
    curatedDocs.find((d) => d.curated!.sha256 === file.sha256)?.curated ?? null;

  // One document/source id pair per retrieved file; the coverage read comes first (M10 order).
  const perFile = new Map<string, { documentId: DocumentId; sourceId: SourceId }>();
  let current: { documentId: DocumentId; sourceId: SourceId } | null = null;
  const extract = async (
    file: FetchedFile,
    evidence: Evidence,
  ): Promise<ScheduleExtractionResult> => {
    const idsFor = perFile.get(file.storageKey)!;
    const curated = curatedFor(file);
    if (curated) return fromCurated(vehicleId, curated, idsFor, evidence, ids);
    if (!reader) return { status: 'failed', reason: 'extraction_failed' };
    return extractMaintenanceSchedule(
      vehicleId,
      {
        uri: services.uriFor(file.storageKey),
        mimeType: file.mimeType,
        documentId: idsFor.documentId,
        sourceId: idsFor.sourceId,
      },
      evidence,
      { ...reader, ids },
    );
  };

  const result = await discoverOfficialSource(identity, {
    provider: discovery,
    retriever,
    registry: services.registry,
    aliases: services.aliases,
    coverage: {
      read: async (file) => {
        current = { documentId: ids.next<'Document'>(), sourceId: ids.next<'Source'>() };
        perFile.set(file.storageKey, current);
        const r = await extract(file, PLACEHOLDER);
        return r.status === 'ok' ? r.coverage : null;
      },
    },
    sourceId: () => current!.sourceId,
    now,
    onStep,
  });
  if (result.status === 'not_found') return { status: 'not_found' };

  const found = result.status === 'verified' ? result.source : result.best;
  const { documentId, sourceId } = perFile.get(found.file.storageKey)!;
  const evidence: Evidence = {
    ...found.evidence,
    reference: { sourceId, documentId },
  };
  // The schedule is extracted with the REAL source evidence (the pipeline may only weaken it).
  const extraction = await extract(found.file, evidence);

  const at = now();
  const doc = createDocument(
    {
      vehicleId,
      kind: found.coverage.documentKind === 'other' ? 'other' : found.coverage.documentKind,
      title: found.candidate.title,
      origin: 'source_discovery',
      authority: found.authority,
      original: {
        storageKey: found.file.storageKey,
        mimeType: found.file.mimeType,
        sizeBytes: found.file.sizeBytes,
        sha256: found.file.sha256,
      },
    },
    { next: <Tag extends string>() => documentId as unknown as import('@/domain').Id<Tag> },
    at,
  );
  if (!doc.ok) return { status: 'not_found' };
  // The retrieved manual is itself evidence: verified only for an official, exactly-applicable
  // source that did not raise injection flags (the extraction withholds exactness otherwise).
  const exact =
    found.evidence.exactApplicability &&
    (extraction.status !== 'ok' || extraction.input.applicability.exact);
  doc.value.verification = decideVerification(
    'maintenance_requirement',
    [{ ...evidence, exactApplicability: exact }],
    at,
  );

  const source: Source = {
    id: sourceId,
    authority: found.authority,
    title: found.candidate.title,
    publisher: new URL(found.file.finalUrl).hostname,
    retrievedFrom: found.file.finalUrl,
    edition: found.coverage.edition,
    retrievedAt: found.retrievedAt,
    documentId,
    ...newMeta(at),
  };
  return {
    status: result.status,
    document: doc.value,
    source,
    schedule: extraction.status === 'ok' ? extraction.input : null,
  };
}

/**
 * A human-curated schedule as an extraction result: same shape as machine extraction, with every
 * item referenced to its page/section/table and quote in the pinned official document. The
 * evidence (authority + exact applicability) still comes from the pipeline, and the domain still
 * decides verification.
 */
function fromCurated(
  vehicleId: VehicleId,
  curated: CuratedSchedule,
  idsFor: { documentId: DocumentId; sourceId: SourceId },
  evidence: Evidence,
  ids: IdGenerator,
): ScheduleExtractionResult {
  return {
    status: 'ok',
    input: {
      vehicleId,
      intervals: curated.intervals.map((iv) => ({
        id: ids.next<'Interval'>(),
        label: iv.label,
        rule: iv.rule,
        everyKm: iv.everyKm,
        everyMonths: iv.everyMonths,
        firstAtKm: iv.firstAtKm,
        firstAtMonths: iv.firstAtMonths,
        items: iv.items.map((it) => ({
          id: ids.next<'MaintenanceItem'>(),
          title: it.title,
          actionType: it.actionType,
          manufacturerText: it.manufacturerText,
          reference: {
            sourceId: idsFor.sourceId,
            documentId: idsFor.documentId,
            page: it.page,
            section: it.section,
            table: it.table,
            quote: it.quote,
          },
        })),
      })),
      evidence: [evidence],
      applicability: { matchedOn: [], exact: evidence.exactApplicability },
    },
    coverage: curated.coverage,
    dropped: [],
    flags: [],
    reviewRequired: false,
  };
}
