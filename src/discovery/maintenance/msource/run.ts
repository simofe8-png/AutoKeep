import type { IsoDate } from '@/domain';

import { findMaintenanceSections, profileDocument } from '../classify';
import { EXTRACTOR_ID, extractRequirements, ground } from '../extract';
import type { AcquiredDocument, PageText, TextReader, VehicleIdentity } from '../types';
import { makeCandidate } from './candidates';
import { canonicalOperation, operationFromText, toEvidenceRecord } from './evidence';
import { fingerprintKey, type VehicleFingerprint } from './fingerprint';
import { extractIntervalMatrix } from './intervalMatrix';
import {
  htmlHeadings,
  matchDocument,
  matchItem,
  readDocumentApplicability,
  sectionContextOf,
  statesAllEngines,
} from './matcher';
import { extractSentences, regimeMapOf } from './sentences';
import {
  MSOURCE_VERSION,
  type AccessDecision,
  type EvidenceRecord,
  type ResolvedSchedule,
  type SourceCandidate,
  type SourceProvenance,
} from './types';

/**
 * Reads the OWNER'S OWN maintenance documents (owner decision 2026-10-04: AutoKeep never looks for
 * a schedule by itself). Each uploaded PDF / HTML document is read on the device, its maintenance
 * items extracted, grounded on the page and matched against the vehicle; the items are only
 * PROPOSED — they become requirements once the owner accepts them (owner review). Nothing is
 * fetched from the network and nothing is resolved automatically.
 */

export type MSourceStage = 'EXTRACTION' | 'VEHICLE_MATCHING';

export type FailureCode =
  | 'UNSUPPORTED_FORMAT'
  | 'TOO_LARGE'
  | 'DUPLICATE_CONTENT'
  | 'EXTRACTOR_UNAVAILABLE'
  | 'MALFORMED_DOCUMENT'
  | 'NO_TEXT_LAYER'
  | 'NO_SCHEDULE_SECTION'
  | 'NO_REQUIREMENTS_EXTRACTED'
  | 'SOURCE_NOT_APPLICABLE'
  | 'SOURCE_MISMATCH_CONFLICT';

export interface StageResult {
  stage: MSourceStage;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  counts: Record<string, number>;
  failures: { code: FailureCode; detail: string; sourceId?: string }[];
  notes: string[];
}

export interface CandidateTrace {
  candidate: Omit<SourceCandidate, 'upload'> & { upload?: { name: string; bytes: number } };
  decisions: AccessDecision[];
  outcome:
    | 'not_attempted'
    | 'acquired'
    | 'duplicate'
    | 'failed'
    | 'extracted'
    | 'no_evidence'
    | 'not_applicable';
  failure?: { code: FailureCode; detail: string };
  sourceId?: string;
}

/** One reading of the owner's documents (stored; owner review reads its evidence). */
export interface MSourceRun {
  runId: string;
  vehicleRef?: string;
  fingerprintKey: string;
  msourceVersion: string;
  startedAt: string;
  finishedAt: string;
  stages: StageResult[];
  candidates: CandidateTrace[];
  schedule: ResolvedSchedule | null;
}

export interface OwnerDocument {
  id: string;
  name: string;
  bytes: Uint8Array;
}

export interface ReaderDeps {
  runId: string;
  vehicleRef?: string;
  /** Text readers: the on-device PDF reader (null where none) and the HTML reader. */
  readers: { pdf: TextReader | null; html: TextReader };
  sha256: (b: Uint8Array) => Promise<string>;
  today: IsoDate;
  now: () => string;
  /** Vehicle facts beyond the fingerprint that some rows depend on (e.g. a service regime). */
  facts?: { serviceRegime?: string | null };
  maxBytes?: number;
}

const MAX_BYTES = 40 * 1024 * 1024;

function identityOf(fp: VehicleFingerprint): VehicleIdentity {
  return {
    kind: fp.kind,
    make: fp.make,
    model: fp.model,
    modelYear: fp.modelYear,
    market: fp.market,
    ...(fp.displacementCc ? { displacementCc: fp.displacementCc } : {}),
    ...(fp.engineCodes[0] ? { engineCode: fp.engineCodes[0] } : {}),
    ...(fp.fuelType ? { powertrain: fp.fuelType } : {}),
    ...(fp.transmission ? { transmission: fp.transmission } : {}),
  };
}

const ms = (a: string, b: string) => Math.max(0, Date.parse(b) - Date.parse(a));

interface Acquired {
  trace: CandidateTrace;
  pages: PageText[];
  provenance: SourceProvenance;
  doc: AcquiredDocument;
  html?: string;
}

export async function readOwnerDocuments(
  fp: VehicleFingerprint,
  uploads: readonly OwnerDocument[],
  deps: ReaderDeps,
): Promise<MSourceRun> {
  const classKey = fingerprintKey(fp);
  const identity = identityOf(fp);
  const run: MSourceRun = {
    runId: deps.runId,
    vehicleRef: deps.vehicleRef,
    fingerprintKey: classKey,
    msourceVersion: MSOURCE_VERSION,
    startedAt: deps.now(),
    finishedAt: '',
    stages: [],
    candidates: [],
    schedule: null,
  };
  const begin = (stage: MSourceStage): StageResult => ({
    stage,
    status: 'ok',
    startedAt: deps.now(),
    finishedAt: '',
    durationMs: 0,
    counts: {},
    failures: [],
    notes: [],
  });
  const end = (s: StageResult, status?: StageResult['status']) => {
    s.finishedAt = deps.now();
    s.durationMs = ms(s.startedAt, s.finishedAt);
    if (status) s.status = status;
    else if (s.failures.length && s.status === 'ok') s.status = 'partial';
    run.stages.push(s);
  };

  // ---------- read each document ----------
  const acquired: Acquired[] = [];
  const bySha = new Map<string, string>();
  for (const u of uploads) {
    const c = makeCandidate({
      url: `upload:${u.id}`,
      title: u.name,
      sourceType: 'user_upload',
      discoveredBy: 'upload',
      discoveredAt: deps.now(),
      upload: { name: u.name, bytes: u.bytes },
    });
    if (!c) continue;
    const t: CandidateTrace = {
      candidate: { ...c, upload: { name: u.name, bytes: u.bytes.length } },
      decisions: [],
      outcome: 'not_attempted',
    };
    run.candidates.push(t);
    const fail = (code: FailureCode, detail: string) => {
      t.outcome = 'failed';
      t.failure = { code, detail };
    };
    const bytes = u.bytes;
    if (bytes.length > (deps.maxBytes ?? MAX_BYTES)) {
      fail('TOO_LARGE', 'upload exceeds the size limit');
      continue;
    }
    const head = String.fromCharCode(...bytes.slice(0, 5));
    const format: 'pdf' | 'html' | null =
      head === '%PDF-'
        ? 'pdf'
        : /^\s*</.test(new TextDecoder().decode(bytes.slice(0, 256)))
          ? 'html'
          : null;
    if (!format) {
      fail('UNSUPPORTED_FORMAT', 'upload is not a PDF or HTML document');
      continue;
    }
    const html = format === 'html' ? new TextDecoder().decode(bytes) : undefined;
    const sha = await deps.sha256(bytes);
    const sourceId = `upload-${sha.slice(0, 16)}`;
    t.sourceId = sourceId;
    const provenance: SourceProvenance = {
      sourceId,
      canonicalUrl: c.canonicalUrl,
      finalUrl: c.canonicalUrl,
      chain: [c.canonicalUrl],
      sourceName: u.name,
      sourceType: 'user_upload',
      discoveredBy: 'upload',
      discoveredAt: c.discoveredAt,
      retrievedAt: deps.now(),
      format,
      documentType: null,
      contentSha256: sha,
      byteLength: bytes.length,
      locale: null,
      markets: [],
      statedApplicability: null,
      access: [],
      extractorVersion: EXTRACTOR_ID,
      msourceVersion: MSOURCE_VERSION,
    };
    const dup = bySha.get(sha);
    if (dup) {
      provenance.duplicateOf = dup;
      t.outcome = 'duplicate';
      t.failure = { code: 'DUPLICATE_CONTENT', detail: `same bytes as ${dup}` };
      continue;
    }
    bySha.set(sha, sourceId);
    const reader = format === 'pdf' ? deps.readers.pdf : deps.readers.html;
    if (!reader) {
      fail('EXTRACTOR_UNAVAILABLE', `no ${format} reader on this host`);
      continue;
    }
    const doc: AcquiredDocument = {
      lead: { url: c.canonicalUrl, title: u.name, via: 'user_upload', adapter: 'upload' },
      url: c.canonicalUrl,
      finalUrl: c.canonicalUrl,
      host: 'upload',
      sha256: sha,
      format,
      bytes,
      system: null,
    };
    let pages: PageText[];
    try {
      pages = await reader.read(doc);
    } catch (e) {
      fail('MALFORMED_DOCUMENT', `text extraction failed: ${String(e).slice(0, 100)}`);
      continue;
    }
    if (!pages.some((p) => p.text.trim())) {
      fail('NO_TEXT_LAYER', 'no text layer (scanned document?)');
      continue;
    }
    t.outcome = 'acquired';
    acquired.push({ trace: t, pages, provenance, doc, html });
  }

  // ---------- EXTRACTION / VEHICLE_MATCHING ----------
  const sources: SourceProvenance[] = [];
  const evidence: EvidenceRecord[] = [];
  const processDocuments = (docs: Acquired[], ex: StageResult, vm: StageResult) => {
    for (const a of docs) {
      const { pages, provenance, doc, trace } = a;
      const sections = findMaintenanceSections(pages);
      const dense = sections.length
        ? sections
        : pages
            .filter(
              (p) =>
                (
                  p.text.match(
                    /\b\d{1,3}(?:[,. ]\d{3})+\s*(?:km|miles?)\b|\b\d{1,2}\s*(?:months?|years?)\b/gi,
                  ) ?? []
                ).length >= 3,
            )
            .map((p) => ({ page: p.n, heading: '(interval-dense page)', score: 1 }));
      const headings = a.html ? htmlHeadings(a.html) : [doc.lead.title ?? ''];
      const docApp = readDocumentApplicability(
        pages,
        fp,
        headings.filter(Boolean),
        dense.map((s) => s.page),
      );
      const profile = profileDocument(doc, pages, identity);
      docApp.markets = [
        ...new Set([...profile.markets, ...(profile.language === 'he' ? ['IL'] : [])]),
      ];
      docApp.profile = profile;
      provenance.documentType = profile.type;
      // The owner's own document: never treated as an official source by itself.
      const authority = { official: false, basis: 'none' as const, detail: 'user upload' };
      provenance.authority = authority;
      if (docApp.yearFrom != null && !docApp.yearBasis) docApp.yearBasis = 'document_text';
      docApp.allEnginesStated = statesAllEngines(headings.join(' | '));
      if (docApp.allEnginesStated) {
        docApp.allEnginesPhrase = headings.find((h) => statesAllEngines(h))?.slice(0, 120);
      }
      provenance.markets = docApp.markets;
      provenance.statedApplicability = { ...docApp, profile: undefined };
      sources.push(provenance);
      const docMatch = matchDocument(docApp, fp);
      vm.counts[docMatch.status] = (vm.counts[docMatch.status] ?? 0) + 1;
      if (!dense.length) {
        trace.outcome = 'no_evidence';
        trace.failure = { code: 'NO_SCHEDULE_SECTION', detail: 'no maintenance schedule section' };
        ex.failures.push({
          code: 'NO_SCHEDULE_SECTION',
          detail: provenance.finalUrl,
          sourceId: provenance.sourceId,
        });
        continue;
      }
      docApp.regimeMap = regimeMapOf(pages);
      const { extracted: tableExtracted } = extractRequirements({
        doc,
        pages,
        sections: dense,
        profile: {
          ...profile,
          models: docApp.models,
          yearFrom: docApp.yearFrom ?? undefined,
          yearTo: docApp.yearTo ?? undefined,
          markets: docApp.markets,
        },
        vehicle: identity,
        authoritative: false,
        today: deps.today,
      });
      const { extracted: sentenceExtracted } = extractSentences({
        doc,
        pages,
        kind: fp.kind,
        make: fp.make,
        authorityHint: profile.authority,
        markets: docApp.markets,
        models: docApp.models,
        years:
          docApp.yearFrom != null
            ? { from: docApp.yearFrom, to: docApp.yearTo ?? docApp.yearFrom }
            : null,
        today: deps.today,
      });
      // The same statement read twice (table line + column sentence) counts once.
      const sig = (e: (typeof tableExtracted)[number]) =>
        JSON.stringify([
          e.page,
          e.requirement.task,
          e.requirement.action,
          e.requirement.interval.every,
          e.requirement.interval.everyMonths,
        ]);
      const seenSig = new Set(tableExtracted.map(sig));
      // Interval-overview matrices (a row per model and production window): each item carries its
      // row's window as its years.
      const { extracted: matrixExtracted } = extractIntervalMatrix({
        doc,
        pages,
        fp,
        authorityHint: profile.authority,
        markets: docApp.markets,
        today: deps.today,
      });
      const rowYears = new Map(matrixExtracted.map((m) => [m.extracted, m.rowYears]));
      const extracted = [
        ...tableExtracted,
        ...sentenceExtracted.filter((e) => !seenSig.has(sig(e))),
        ...matrixExtracted.map((m) => m.extracted),
      ];
      ex.counts.extracted = (ex.counts.extracted ?? 0) + extracted.length;
      if (!extracted.length) {
        trace.outcome = 'no_evidence';
        trace.failure = {
          code: 'NO_REQUIREMENTS_EXTRACTED',
          detail: 'schedule section without readable intervals',
        };
        ex.failures.push({
          code: 'NO_REQUIREMENTS_EXTRACTED',
          detail: provenance.finalUrl,
          sourceId: provenance.sourceId,
        });
        continue;
      }
      const records: EvidenceRecord[] = [];
      for (const e of extracted) {
        const grounded = ground(e, pages);
        if (grounded) ex.counts.grounded = (ex.counts.grounded ?? 0) + 1;
        const text = e.requirement.taskText ?? '';
        const operation =
          operationFromText(text) ??
          canonicalOperation(e.requirement.task, e.requirement.action, text);
        const section = sectionContextOf(pages, { page: e.page, text }, fp);
        const { match, item } = matchItem(docApp, e.requirement, fp, {
          operation,
          official: authority.official,
          documentType: profile.type,
          manufacturerDocument: false,
          sectionYears: rowYears.get(e) ?? section.sectionYears,
          sectionText: section.sectionText,
          facts: deps.facts,
        });
        const record = toEvidenceRecord(e, provenance.sourceId, match, grounded);
        record.itemApplicability = item;
        if (item.years) record.yearApplicability = item.years;
        records.push(record);
      }
      evidence.push(...records);
      const usable = records.some((r) =>
        ['EXACT', 'STRONG', 'SUPPORTED'].includes(
          r.match.conditional ? (r.match.baseStatus ?? '') : r.match.status,
        ),
      );
      trace.outcome = usable ? 'extracted' : 'not_applicable';
      if (!usable) {
        const code: FailureCode =
          docMatch.status === 'CONFLICTING' ? 'SOURCE_MISMATCH_CONFLICT' : 'SOURCE_NOT_APPLICABLE';
        trace.failure = {
          code,
          detail: `${docMatch.status}: ${docMatch.reasons.join('; ')}`.slice(0, 300),
        };
        vm.failures.push({ code, detail: trace.failure.detail, sourceId: provenance.sourceId });
      }
    }
  };

  const ex = begin('EXTRACTION');
  const vm: StageResult = { ...ex, stage: 'VEHICLE_MATCHING', counts: {}, failures: [], notes: [] };
  processDocuments(acquired, ex, vm);
  end(ex, ex.counts.extracted ? undefined : 'failed');
  vm.startedAt = ex.finishedAt;
  end(vm);

  // Nothing is resolved automatically: the evidence is only proposed to the owner.
  run.schedule = {
    fingerprintKey: classKey,
    status: 'NO_SOURCE_FOUND',
    items: [],
    unresolved: [],
    sources,
    evidence,
    resolvedAt: deps.now(),
    msourceVersion: MSOURCE_VERSION,
  };
  run.finishedAt = deps.now();
  return run;
}
