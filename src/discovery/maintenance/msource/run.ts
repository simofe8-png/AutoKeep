import type { IsoDate } from '@/domain';

import { findMaintenanceSections, profileDocument } from '../classify';
import { EXTRACTOR_ID, extractRequirements, ground } from '../extract';
import { anchorsOf } from '../htmlText';
import { linkNamesVehicle } from '../match';
import { systemForHost } from '../registry/sourceSystem';
import type { AcquiredDocument, PageText, TextReader, VehicleIdentity } from '../types';
import {
  decideDiscovery,
  decideExtraction,
  decideFetch,
  decideStorage,
  type AccessContext,
  type AccessDecision,
} from './accessEngine';
import { archivedCopy, type AdapterOutcome, type DiscoveryAdapter } from './adapters';
import { dedupeCandidates, makeCandidate } from './candidates';
import { canonicalOperation, operationFromText, toEvidenceRecord } from './evidence';
import { fingerprintKey, type VehicleFingerprint } from './fingerprint';
import { safeEvent, type MSourceLogger } from './log';
import { officialMetadataYear, officialVariantToken, sourceIdentity } from './authority';
import {
  htmlHeadings,
  matchDocument,
  matchItem,
  readDocumentApplicability,
  sectionContextOf,
  statesAllEngines,
} from './matcher';
import { extractIntervalMatrix } from './intervalMatrix';
import { guardedFetch, type GuardedFetchDeps } from './netGuard';
import { generateQueries } from './queries';
import { resolveSchedule } from './resolver';
import { extractSentences, regimeMapOf } from './sentences';
import {
  MSOURCE_VERSION,
  OFFICIAL_SOURCE_TYPES,
  type EvidenceRecord,
  type ResolvedSchedule,
  type SourceCandidate,
  type SourceProvenance,
} from './types';

/**
 * M-SOURCE run (Phases 3, 10–15, 17): one confirmed vehicle through explicit stages, each
 * returning structured state. A failing source never stops the run; a failing stage is recorded,
 * never replaced by guessed data.
 *
 * VEHICLE_VERIFIED → DISCOVERY → SOURCE_CANDIDATES → ACQUISITION → EXTRACTION →
 * VEHICLE_MATCHING → CROSS_SOURCE_VALIDATION → SCHEDULE_RESOLUTION → PERSISTENCE →
 * NEXT_SERVICE_CALCULATION
 */

export const STAGES = [
  'VEHICLE_VERIFIED',
  'DISCOVERY',
  'SOURCE_CANDIDATES',
  'ACQUISITION',
  'EXTRACTION',
  'VEHICLE_MATCHING',
  'CROSS_SOURCE_VALIDATION',
  'SCHEDULE_RESOLUTION',
  'PERSISTENCE',
  'NEXT_SERVICE_CALCULATION',
] as const;
export type MSourceStage = (typeof STAGES)[number];

export type FailureCode =
  | 'VEHICLE_NOT_CONFIRMED'
  | 'ADAPTER_UNAVAILABLE'
  | 'ADAPTER_FAILED'
  | 'NO_CANDIDATES'
  | 'ACCESS_BLOCKED'
  | 'ACCESS_MANUAL_ONLY'
  | 'ACCESS_UNKNOWN'
  /** robots.txt unreachable (5xx / 429 / network): blocked for this run, retried next run. */
  | 'ACCESS_TEMPORARILY_UNREACHABLE'
  | 'ACCESS_CONTROL_DETECTED'
  | 'NETWORK_FAILURE'
  | 'HTTP_ERROR'
  | 'SOURCE_GONE'
  | 'UNSUPPORTED_FORMAT'
  | 'TOO_LARGE'
  | 'URL_REJECTED'
  | 'DUPLICATE_CONTENT'
  | 'EXTRACTION_BLOCKED'
  | 'EXTRACTOR_UNAVAILABLE'
  | 'MALFORMED_DOCUMENT'
  | 'NO_TEXT_LAYER'
  | 'NO_SCHEDULE_SECTION'
  | 'NO_REQUIREMENTS_EXTRACTED'
  | 'SOURCE_NOT_APPLICABLE'
  | 'SOURCE_MISMATCH_CONFLICT'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'PERSISTENCE_FAILED'
  | 'BUDGET_EXHAUSTED';

export interface StageResult {
  stage: MSourceStage;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  counts: Record<string, number>;
  failures: { code: FailureCode; detail: string; sourceId?: string; adapter?: string }[];
  notes: string[];
}

export interface CandidateTrace {
  candidate: Omit<SourceCandidate, 'upload'> & { upload?: { name: string; bytes: number } };
  decisions: AccessDecision[];
  outcome:
    | 'not_attempted'
    | 'acquired'
    | 'duplicate'
    | 'blocked'
    | 'failed'
    | 'extracted'
    | 'no_evidence'
    | 'not_applicable';
  failure?: { code: FailureCode; detail: string };
  sourceId?: string;
}

export interface MSourceRun {
  runId: string;
  vehicleRef?: string;
  fingerprintKey: string;
  msourceVersion: string;
  startedAt: string;
  finishedAt: string;
  stages: StageResult[];
  queries: string[];
  candidates: CandidateTrace[];
  restricted: { url: string; reason: string; adapter: string }[];
  schedule: ResolvedSchedule | null;
}

/** Cached per (canonical URL, vehicle class): structured results only — never document bytes. */
export interface CachedSource {
  provenance: SourceProvenance;
  evidence: EvidenceRecord[];
}

export interface EvidenceCache {
  get(canonicalUrl: string, classKey: string): CachedSource | null;
  put(canonicalUrl: string, classKey: string, value: CachedSource): void;
}

export interface RunnerDeps {
  runId: string;
  vehicleRef?: string;
  adapters: DiscoveryAdapter[];
  access: AccessContext;
  net: GuardedFetchDeps;
  /**
   * Text readers. `pdf` reads any PDF (null where none is available: the mobile app host);
   * `uploadPdf` reads only the owner's own uploaded PDFs (the on-device WebView reader).
   */
  readers: { pdf: TextReader | null; html: TextReader; uploadPdf?: TextReader | null };
  /**
   * The owner's uploads are extracted and matched, but kept out of automatic resolution: their
   * items become requirements only once the owner accepts them (owner review, D-A3).
   */
  holdUploadsForOwnerReview?: boolean;
  sha256: (b: Uint8Array) => Promise<string>;
  today: IsoDate;
  now: () => string;
  limits?: Partial<RunLimits>;
  /** Vehicle facts beyond the fingerprint that some rows depend on (e.g. a service regime). */
  facts?: { serviceRegime?: string | null };
  cache?: EvidenceCache;
  archive?: boolean;
  log?: MSourceLogger;
  onStage?: (stage: MSourceStage) => void;
  persist?: (run: MSourceRun) => Promise<void>;
  nextService?: (schedule: ResolvedSchedule) => Promise<{ computed: number } | null>;
}

export interface RunLimits {
  maxCandidates: number;
  maxDocuments: number;
  /** Extra documents read when the first pass leaves conflicts or insufficient evidence. */
  conflictExtra: number;
  concurrency: number;
  maxLinks: number;
  maxPdfBytes: number;
  maxHtmlBytes: number;
  /** Politeness: minimum time between two requests to the same host. */
  hostGapMs: number;
}

const DEFAULT_RUN_LIMITS: RunLimits = {
  maxCandidates: 40,
  maxDocuments: 14,
  conflictExtra: 8,
  concurrency: 2,
  maxLinks: 6,
  maxPdfBytes: 40 * 1024 * 1024,
  maxHtmlBytes: 4 * 1024 * 1024,
  hostGapMs: 1500,
};

const BOT_WALL =
  /(captcha|cf-chl|cf_chl|access denied|request unsuccessful\. incapsula|are you a robot|verify you are human|sign in to continue|please log ?in|subscribe to (read|continue))/i;

/** Discovery-time ordering (metadata only; evidence decides trust later). */
function priority(c: SourceCandidate, fp: VehicleFingerprint): number {
  let s = 0;
  if (c.upload) s += 100;
  if (OFFICIAL_SOURCE_TYPES.includes(c.sourceType)) s += 4;
  if (c.sourceType === 'independent_database' || c.sourceType === 'service_document') s += 2;
  if (c.sourceType === 'forum') s -= 3;
  if (c.formatHint === 'pdf') s += 1;
  const a = c.statedApplicability;
  if (
    a?.engineCodes?.some((x) =>
      fp.engineCodes.some((v) => x.toUpperCase().startsWith(v.slice(0, 3))),
    )
  )
    s += 2;
  if (a?.yearFrom != null && fp.modelYear >= a.yearFrom && fp.modelYear <= (a.yearTo ?? a.yearFrom))
    s += 1;
  if (a?.yearFrom != null && (fp.modelYear < a.yearFrom || fp.modelYear > (a.yearTo ?? a.yearFrom)))
    s -= 2;
  if (c.discoveredBy === 'catalog') s += 3;
  return s;
}

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

async function mapBounded<T, R>(items: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await f(items[k]);
    }
  });
  await Promise.all(workers);
  return out;
}

const traceCandidate = (c: SourceCandidate): CandidateTrace['candidate'] => {
  const { upload, ...rest } = c;
  return upload ? { ...rest, upload: { name: upload.name, bytes: upload.bytes.length } } : rest;
};

const failureOfDecision = (d: AccessDecision): FailureCode =>
  d.reason === 'access_control_detected'
    ? 'ACCESS_CONTROL_DETECTED'
    : d.reason === 'robots_unreachable'
      ? 'ACCESS_TEMPORARILY_UNREACHABLE'
      : d.status === 'MANUAL_ONLY'
        ? 'ACCESS_MANUAL_ONLY'
        : d.status === 'UNKNOWN'
          ? 'ACCESS_UNKNOWN'
          : d.reason === 'invalid_url'
            ? 'URL_REJECTED'
            : 'ACCESS_BLOCKED';

interface Acquired {
  trace: CandidateTrace;
  pages: PageText[];
  provenance: SourceProvenance;
  doc: AcquiredDocument;
  html?: string;
}

export async function runMSource(fp: VehicleFingerprint, deps: RunnerDeps): Promise<MSourceRun> {
  const L = { ...DEFAULT_RUN_LIMITS, ...deps.limits };
  const classKey = fingerprintKey(fp);
  const identity = identityOf(fp);
  const log = (e: Parameters<MSourceLogger>[0]) => deps.log?.(safeEvent(e));
  const run: MSourceRun = {
    runId: deps.runId,
    vehicleRef: deps.vehicleRef,
    fingerprintKey: classKey,
    msourceVersion: MSOURCE_VERSION,
    startedAt: deps.now(),
    finishedAt: '',
    stages: [],
    queries: [],
    candidates: [],
    restricted: [],
    schedule: null,
  };
  const begin = (stage: MSourceStage): StageResult => {
    deps.onStage?.(stage);
    return {
      stage,
      status: 'ok',
      startedAt: deps.now(),
      finishedAt: '',
      durationMs: 0,
      counts: {},
      failures: [],
      notes: [],
    };
  };
  const end = (s: StageResult, status?: StageResult['status']) => {
    s.finishedAt = deps.now();
    s.durationMs = ms(s.startedAt, s.finishedAt);
    if (status) s.status = status;
    else if (s.failures.length && s.status === 'ok') s.status = 'partial';
    run.stages.push(s);
    log({
      runId: run.runId,
      vehicleRef: run.vehicleRef,
      stage: s.stage,
      status: s.status,
      durationMs: s.durationMs,
      failureCode: s.failures[0]?.code,
    });
  };

  // ---------- VEHICLE_VERIFIED ----------
  const vv = begin('VEHICLE_VERIFIED');
  vv.counts = { engineCodes: fp.engineCodes.length, displacementKnown: fp.displacementCc ? 1 : 0 };
  vv.notes.push(`class ${classKey}`);
  end(vv);

  // ---------- DISCOVERY ----------
  const ds = begin('DISCOVERY');
  const queries = generateQueries(fp);
  run.queries = queries.map((q) => q.text);
  const discovered: SourceCandidate[] = [];
  for (const adapter of deps.adapters) {
    const t0 = deps.now();
    const out: AdapterOutcome = await adapter
      .discover({ fingerprint: fp, queries, now: deps.now })
      .catch((e): AdapterOutcome => ({
        adapter: adapter.id,
        status: 'failed' as const,
        candidates: [],
        notes: [String(e).slice(0, 160)],
      }));
    ds.counts[adapter.id] = out.candidates.length;
    if (out.status === 'unavailable') {
      ds.failures.push({
        code: 'ADAPTER_UNAVAILABLE',
        detail: out.notes.join('; '),
        adapter: adapter.id,
      });
    } else if (out.status === 'failed') {
      ds.failures.push({
        code: 'ADAPTER_FAILED',
        detail: out.notes.join('; '),
        adapter: adapter.id,
      });
    }
    for (const r of out.restricted ?? []) run.restricted.push({ ...r, adapter: adapter.id });
    discovered.push(...out.candidates);
    log({
      runId: run.runId,
      stage: 'DISCOVERY',
      adapter: adapter.id,
      status: out.status,
      durationMs: ms(t0, deps.now()),
    });
  }
  end(ds, discovered.length ? (ds.failures.length ? 'partial' : 'ok') : 'failed');

  // ---------- SOURCE_CANDIDATES ----------
  const sc = begin('SOURCE_CANDIDATES');
  const { unique, duplicates } = dedupeCandidates(discovered);
  const ordered = [...unique]
    .sort((a, b) => priority(b, fp) - priority(a, fp))
    .slice(0, L.maxCandidates);
  const traces = new Map<string, CandidateTrace>();
  for (const c of ordered) {
    const d = decideDiscovery(c.url, deps.access, !!c.upload);
    const t: CandidateTrace = {
      candidate: traceCandidate(c),
      decisions: [d],
      outcome: 'not_attempted',
    };
    if (d.status !== 'ALLOWED') {
      t.outcome = 'blocked';
      t.failure = { code: 'URL_REJECTED', detail: d.evidence[0]?.detail ?? d.reason };
    }
    traces.set(c.id, t);
  }
  sc.counts = {
    discovered: discovered.length,
    unique: unique.length,
    duplicates: duplicates.length,
    kept: ordered.length,
  };
  if (!ordered.length)
    sc.failures.push({ code: 'NO_CANDIDATES', detail: 'no candidate source was discovered' });
  end(sc, ordered.length ? 'ok' : 'failed');

  // ---------- ACQUISITION ----------
  const aq = begin('ACQUISITION');
  const acquired: Acquired[] = [];
  const cachedSources: CachedSource[] = [];
  const bySha = new Map<string, string>();
  const queue = ordered.filter((c) => traces.get(c.id)!.outcome === 'not_attempted');
  let budget = L.maxDocuments;
  const seenUrls = new Set(ordered.map((c) => c.canonicalUrl));

  const lastHit = new Map<string, number>();
  const politeWait = async (url: string) => {
    if (L.hostGapMs <= 0) return;
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    const wait = (lastHit.get(host) ?? 0) + L.hostGapMs - Date.now();
    lastHit.set(host, Date.now() + Math.max(0, wait));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };

  const acquireOne = async (c: SourceCandidate): Promise<void> => {
    const t = traces.get(c.id)!;
    const fail = (
      code: FailureCode,
      detail: string,
      outcome: CandidateTrace['outcome'] = 'failed',
    ) => {
      t.outcome = outcome;
      t.failure = { code, detail };
      aq.failures.push({ code, detail: detail.slice(0, 200), sourceId: c.id });
    };
    const cached = !c.upload ? deps.cache?.get(c.canonicalUrl, classKey) : null;
    if (cached) {
      t.outcome = 'acquired';
      t.sourceId = cached.provenance.sourceId;
      cachedSources.push(cached);
      aq.counts.cached = (aq.counts.cached ?? 0) + 1;
      return;
    }
    let bytes: Uint8Array;
    let finalUrl = c.canonicalUrl;
    let chain: string[] = [c.canonicalUrl];
    let contentType = '';
    let fetchDecision: AccessDecision | null = null;
    if (c.upload) {
      bytes = c.upload.bytes;
      if (bytes.length > L.maxPdfBytes) return fail('TOO_LARGE', 'upload exceeds the size limit');
    } else {
      fetchDecision = await decideFetch(c.canonicalUrl, deps.access);
      t.decisions.push(fetchDecision);
      if (fetchDecision.status !== 'ALLOWED') {
        return fail(
          failureOfDecision(fetchDecision),
          fetchDecision.evidence[0]?.detail ?? fetchDecision.reason,
          'blocked',
        );
      }
      await politeWait(c.canonicalUrl);
      const r = await guardedFetch(
        c.canonicalUrl,
        {
          ...deps.net,
          authorizeHop: async (hop) => {
            const d = await decideFetch(hop, deps.access);
            t.decisions.push(d);
            return d.status === 'ALLOWED' ? null : `${d.status} ${d.reason}`;
          },
        },
        {
          timeoutMs: 45_000,
          maxBytes: L.maxPdfBytes,
          maxRedirects: 5,
          retries: 2,
          allowedTypes: ['pdf', 'html'],
        },
      );
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          const d: AccessDecision = {
            ...fetchDecision,
            status: 'BLOCKED',
            reason: 'access_control_detected',
            evidence: [{ kind: 'response', ref: c.canonicalUrl, detail: `HTTP ${r.status}` }],
            decidedAt: deps.now(),
          };
          t.decisions.push(d);
          return fail('ACCESS_CONTROL_DETECTED', `HTTP ${r.status}`, 'blocked');
        }
        if (r.status === 404 || r.status === 410) {
          fail('SOURCE_GONE', `HTTP ${r.status}`);
          if (deps.archive && !c.archiveOf) {
            const copy = await archivedCopy(
              c,
              deps.net,
              async (u) => (await decideFetch(u, deps.access)).status === 'ALLOWED',
              deps.now(),
            ).catch(() => null);
            if (copy && !seenUrls.has(copy.canonicalUrl)) {
              seenUrls.add(copy.canonicalUrl);
              traces.set(copy.id, {
                candidate: traceCandidate(copy),
                decisions: [decideDiscovery(copy.url, deps.access)],
                outcome: 'not_attempted',
              });
              queue.push(copy);
            }
          }
          return;
        }
        if (r.failure === 'REDIRECT_BLOCKED')
          return fail('ACCESS_BLOCKED', `redirect: ${r.detail}`, 'blocked');
        if (r.failure === 'CONTENT_TYPE_NOT_ALLOWED') return fail('UNSUPPORTED_FORMAT', r.detail);
        if (r.failure === 'TOO_LARGE') return fail('TOO_LARGE', r.detail);
        if (
          r.failure === 'TIMEOUT' ||
          r.failure === 'NETWORK_ERROR' ||
          r.failure === 'DNS_FAILURE'
        ) {
          return fail('NETWORK_FAILURE', `${r.failure}: ${r.detail}`);
        }
        if (r.failure === 'HTTP_ERROR') return fail('HTTP_ERROR', r.detail);
        return fail('URL_REJECTED', `${r.failure}: ${r.detail}`);
      }
      bytes = r.response.bytes;
      finalUrl = r.response.finalUrl;
      chain = r.response.chain;
      contentType = r.response.contentType;
      if (r.response.kind === 'html' && bytes.length > L.maxHtmlBytes)
        return fail('TOO_LARGE', 'html page too large');
    }
    const head = String.fromCharCode(...bytes.slice(0, 5));
    const format: 'pdf' | 'html' | null =
      head === '%PDF-'
        ? 'pdf'
        : c.upload
          ? /^\s*</.test(new TextDecoder().decode(bytes.slice(0, 256)))
            ? 'html'
            : null
          : /html/i.test(contentType) || /^\s*</.test(new TextDecoder().decode(bytes.slice(0, 256)))
            ? 'html'
            : null;
    if (!format)
      return fail(
        'UNSUPPORTED_FORMAT',
        c.upload ? 'upload is not a PDF or HTML document' : contentType || 'unknown',
      );
    const html = format === 'html' ? new TextDecoder().decode(bytes) : undefined;
    if (html && !c.upload && BOT_WALL.test(html.slice(0, 200_000)) && html.length < 400_000) {
      t.decisions.push({
        ...(fetchDecision as AccessDecision),
        status: 'BLOCKED',
        reason: 'access_control_detected',
        evidence: [{ kind: 'response', ref: finalUrl, detail: 'login / CAPTCHA / paywall page' }],
        decidedAt: deps.now(),
      });
      return fail('ACCESS_CONTROL_DETECTED', 'login / CAPTCHA / paywall page', 'blocked');
    }
    const sha = await deps.sha256(bytes);
    const sourceId = c.upload ? `upload-${sha.slice(0, 16)}` : c.id;
    t.sourceId = sourceId;
    const storage = decideStorage({ url: finalUrl, upload: !!c.upload }, deps.access);
    const extraction = decideExtraction(
      { url: finalUrl, upload: !!c.upload, fetch: fetchDecision, html },
      deps.access,
    );
    t.decisions.push(storage, extraction);
    const host = (() => {
      try {
        return c.upload ? 'upload' : new URL(finalUrl).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();
    const provenance: SourceProvenance = {
      sourceId,
      canonicalUrl: c.canonicalUrl,
      finalUrl,
      chain,
      sourceName: c.publisher ?? (c.upload ? c.upload.name : host),
      sourceType: c.sourceType,
      discoveredBy: c.discoveredBy,
      discoveredAt: c.discoveredAt,
      retrievedAt: deps.now(),
      format,
      documentType: null,
      contentSha256: sha,
      byteLength: bytes.length,
      locale: c.language ?? null,
      markets: [],
      statedApplicability: null,
      access: t.decisions.filter((d) => d.operation !== 'DISCOVERY'),
      extractorVersion: EXTRACTOR_ID,
      msourceVersion: MSOURCE_VERSION,
      ...(c.archiveOf ? { archiveOf: c.archiveOf } : {}),
    };
    const dup = bySha.get(sha);
    if (dup) {
      provenance.duplicateOf = dup;
      t.outcome = 'duplicate';
      t.failure = { code: 'DUPLICATE_CONTENT', detail: `same bytes as ${dup}` };
      aq.counts.duplicates = (aq.counts.duplicates ?? 0) + 1;
      return;
    }
    bySha.set(sha, sourceId);
    if (extraction.status !== 'ALLOWED') {
      t.outcome = 'blocked';
      t.failure = { code: 'EXTRACTION_BLOCKED', detail: extraction.reason };
      aq.failures.push({ code: 'EXTRACTION_BLOCKED', detail: extraction.reason, sourceId });
      return;
    }
    const reader =
      format === 'pdf'
        ? c.upload
          ? (deps.readers.uploadPdf ?? deps.readers.pdf)
          : deps.readers.pdf
        : deps.readers.html;
    if (!reader) return fail('EXTRACTOR_UNAVAILABLE', `no ${format} reader on this host`);
    const doc: AcquiredDocument = {
      lead: {
        url: finalUrl,
        title: c.title,
        via: c.upload ? 'user_upload' : 'web_search',
        adapter: c.discoveredBy,
      },
      url: c.canonicalUrl,
      finalUrl,
      host,
      sha256: sha,
      format,
      bytes,
      system: c.upload ? null : systemForHost(host, deps.access.registry),
    };
    let pages: PageText[];
    try {
      pages = await reader.read(doc);
    } catch (e) {
      return fail('MALFORMED_DOCUMENT', `text extraction failed: ${String(e).slice(0, 100)}`);
    }
    if (!pages.some((p) => p.text.trim()))
      return fail('NO_TEXT_LAYER', 'no text layer (scanned document?)');
    t.outcome = 'acquired';
    acquired.push({ trace: t, pages, provenance, doc, html });

    // Link discovery (depth 1): documents this page links to that name the vehicle.
    if (html && !c.parentId && findMaintenanceSections(pages).length === 0) {
      const links = anchorsOf(html, finalUrl)
        .filter(
          (a) =>
            linkNamesVehicle(a.text, a.href, identity) ||
            (/\.pdf($|\?)/i.test(a.href) &&
              linkNamesVehicle(a.text + ' ' + a.href, a.href, identity)),
        )
        .slice(0, L.maxLinks);
      for (const a of links) {
        const child = makeCandidate({
          url: a.href,
          title: a.text.slice(0, 160),
          sourceType: c.sourceType,
          discoveredBy: 'link',
          discoveredAt: deps.now(),
          parentId: c.id,
        });
        if (!child || seenUrls.has(child.canonicalUrl)) continue;
        seenUrls.add(child.canonicalUrl);
        traces.set(child.id, {
          candidate: traceCandidate(child),
          decisions: [decideDiscovery(child.url, deps.access)],
          outcome: 'not_attempted',
        });
        queue.push(child);
      }
    }
  };

  const drain = async () => {
    while (queue.length && budget > 0) {
      const batch = queue.splice(0, Math.min(budget, L.concurrency));
      budget -= batch.length;
      await mapBounded(batch, L.concurrency, (c) =>
        acquireOne(c).catch((e) => {
          const t = traces.get(c.id)!;
          t.outcome = 'failed';
          t.failure = { code: 'NETWORK_FAILURE', detail: String(e).slice(0, 160) };
        }),
      );
    }
  };
  await drain();

  // ---------- EXTRACTION / VEHICLE_MATCHING (per acquired document) ----------
  const sources: SourceProvenance[] = cachedSources.map((s) => s.provenance);
  const evidence: EvidenceRecord[] = cachedSources.flatMap((s) => s.evidence);
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
      // Source identity (official or not) — independent of the access decisions.
      const authority =
        doc.lead.via === 'user_upload'
          ? { official: false, basis: 'none' as const, detail: 'user upload' }
          : sourceIdentity(doc.host, fp.make, profile.type, deps.access.registry, doc.finalUrl);
      provenance.authority = authority;
      // Trusted document metadata: the manufacturer's own model-year designation (official
      // sources only; never a third-party filename).
      const meta = authority.official ? officialMetadataYear(provenance.finalUrl) : null;
      if (meta) {
        docApp.yearFrom = meta.year;
        docApp.yearTo = meta.year;
        docApp.yearBasis = 'official_metadata';
        docApp.yearDesignation = meta.designation;
      } else if (docApp.yearFrom != null && !docApp.yearBasis) docApp.yearBasis = 'document_text';
      // A body-variant token in the OFFICIAL document identity ("…/{model}_sc/…").
      if (authority.official) {
        const variant = officialVariantToken(provenance.finalUrl, fp.model);
        if (variant) docApp.variantToken = variant;
      }
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
          manufacturerDocument: authority.basis === 'brand_domain',
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
      deps.cache?.put(provenance.canonicalUrl, classKey, { provenance, evidence: records });
    }
  };

  const officialHost = (host: string) => {
    // Official provenance only for owner-approved registry systems (proposed ones are pending).
    const s = systemForHost(host, deps.access.registry);
    return !!s && s.status === 'approved';
  };
  const held = (e: EvidenceRecord) =>
    deps.holdUploadsForOwnerReview === true &&
    sources.find((x) => x.sourceId === e.sourceId)?.sourceType === 'user_upload';
  // Held evidence stays in the schedule's evidence list (for owner review), never in its items.
  const resolveNow = (): ResolvedSchedule => ({
    ...resolveSchedule({
      fingerprintKey: classKey,
      market: fp.market,
      make: fp.make,
      sources,
      evidence: evidence.filter((e) => !held(e)),
      officialHost,
      now: deps.now(),
      acquiredSources: sources.length,
    }),
    evidence,
  });

  aq.counts.acquired = acquired.length;
  end(aq, acquired.length || cachedSources.length ? undefined : 'failed');
  const ex = begin('EXTRACTION');
  const vm: StageResult = { ...ex, stage: 'VEHICLE_MATCHING', counts: {}, failures: [], notes: [] };
  processDocuments(acquired.splice(0), ex, vm);
  // Conflicts or insufficient evidence trigger additional acquisition where candidates remain.
  let schedule = resolveNow();
  if (
    (schedule.status !== 'READY' || schedule.unresolved.some((u) => u.quality === 'CONFLICTING')) &&
    queue.length
  ) {
    budget = L.conflictExtra;
    ex.notes.push(`additional acquisition: ${Math.min(queue.length, budget)} more candidates`);
    await drain();
    processDocuments(acquired.splice(0), ex, vm);
    schedule = resolveNow();
  }
  if (queue.length) ex.notes.push(`${queue.length} candidates not read (document budget)`);
  end(ex, ex.counts.extracted ? undefined : 'failed');
  deps.onStage?.('VEHICLE_MATCHING');
  vm.startedAt = ex.finishedAt;
  end(
    vm,
    Object.keys(vm.counts).some((k) => ['EXACT', 'STRONG', 'SUPPORTED'].includes(k))
      ? undefined
      : 'failed',
  );

  // ---------- CROSS_SOURCE_VALIDATION ----------
  const cv = begin('CROSS_SOURCE_VALIDATION');
  cv.counts = {
    obligations: schedule.items.length + schedule.unresolved.length,
    corroborated: schedule.items.filter((i) => i.independentSources >= 2).length,
    conflicting: schedule.unresolved.filter((i) => i.quality === 'CONFLICTING').length,
  };
  for (const u of schedule.unresolved.filter((i) => i.quality === 'CONFLICTING')) {
    cv.failures.push({
      code: 'CONFLICTING_EVIDENCE',
      detail: `${u.operation}/${u.action}: ${u.conflicts.map((c) => `${c.intervalKm ?? '-'} km/${c.intervalMonths ?? '-'} mo`).join(' vs ')}`,
    });
  }
  end(cv);

  // ---------- SCHEDULE_RESOLUTION ----------
  const sr = begin('SCHEDULE_RESOLUTION');
  sr.counts = {
    items: schedule.items.length,
    unresolved: schedule.unresolved.length,
    exact: schedule.items.filter((i) => i.quality === 'EXACT').length,
    strong: schedule.items.filter((i) => i.quality === 'STRONG').length,
    supported: schedule.items.filter((i) => i.quality === 'SUPPORTED').length,
  };
  sr.notes.push(`status ${schedule.status}`);
  if (schedule.status === 'INSUFFICIENT_EVIDENCE' || schedule.status === 'NO_SOURCE_FOUND') {
    sr.failures.push({ code: 'INSUFFICIENT_EVIDENCE', detail: schedule.status });
  }
  run.schedule = schedule;
  end(sr, schedule.items.length ? (schedule.status === 'READY' ? 'ok' : 'partial') : 'failed');
  run.candidates = [...traces.values()];

  // ---------- PERSISTENCE ----------
  const ps = begin('PERSISTENCE');
  run.finishedAt = deps.now();
  if (deps.persist) {
    try {
      await deps.persist(run);
    } catch (e) {
      ps.failures.push({ code: 'PERSISTENCE_FAILED', detail: String(e).slice(0, 160) });
    }
    end(ps, ps.failures.length ? 'failed' : 'ok');
  } else end(ps, 'skipped');

  // ---------- NEXT_SERVICE_CALCULATION ----------
  const ns = begin('NEXT_SERVICE_CALCULATION');
  if (deps.nextService && schedule.items.length) {
    const r = await deps.nextService(schedule).catch(() => null);
    ns.counts = { computed: r?.computed ?? 0 };
    end(ns, r ? 'ok' : 'failed');
  } else {
    ns.notes.push(
      schedule.items.length ? 'computed by the host from the stored schedule' : 'no schedule',
    );
    end(ns, 'skipped');
  }
  run.finishedAt = deps.now();
  return run;
}
