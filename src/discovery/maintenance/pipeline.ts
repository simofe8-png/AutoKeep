import {
  currentRequirements,
  type EvidenceLevel,
  type IsoDate,
  type KnowledgeEntry,
  type KnowledgeSource,
  type MaintenanceRequirement,
} from '@/domain';
import { assessEvidence, resolveRequirements, type TaskResolution } from '@/engine/requirements';

import { acquire, hostOf, policyBlock } from './access';
import { failureOfBlock } from './adapters';
import { permits } from './registry/policy';
import { policyOf, systemForHost } from './registry/sourceSystem';
import { findMaintenanceSections, profileDocument } from './classify';
import { recordDocumentVersion, type DocumentVersion } from './documentVersions';
import { extractRequirements, ground } from './extract';
import type {
  DiscoveryContext,
  DiscoveryOutcome,
  FailureClass,
  SourceDiscovery,
  SourceLead,
  TextReader,
  VehicleIdentity,
  VehicleRunTrace,
} from './types';

/**
 * Orchestrates the universal maintenance pipeline for ONE vehicle:
 *   reusable knowledge → discovery adapters → access policy → acquisition → document profile →
 *   maintenance sections → atomic extraction → grounding → evidence levels → per-task resolution.
 * Every stage leaves a trace; every failure is classified. No interval is ever produced without a
 * grounded location in a retrieved document (or a catalog entry that had one).
 */

export interface PipelineDeps extends DiscoveryContext {
  sha256: (b: Uint8Array) => Promise<string>;
  readers: { pdf: TextReader; html: TextReader };
  adapters: SourceDiscovery[];
  catalog: readonly KnowledgeEntry[];
  today: IsoDate;
  maxDocuments?: number;
  /** Known document versions (identity + sha256), append-only. */
  versions?: readonly DocumentVersion[];
}

export interface PipelineResult {
  trace: VehicleRunTrace;
  resolutions: TaskResolution[];
  /** Verified requirements whose source allows reuse — candidates for the knowledge catalog. */
  catalogCandidates: { requirement: MaintenanceRequirement; source: KnowledgeSource }[];
  /** The document-version store after this run (new versions appended). */
  versions: DocumentVersion[];
}

const DRIVING: EvidenceLevel[] = ['A', 'B'];

export async function runMaintenancePipeline(
  v: VehicleIdentity,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const facts = { ...v, market: v.market ?? 'IL' };
  const trace: VehicleRunTrace = {
    identity: v,
    catalogHits: 0,
    catalogKnown: 0,
    discovery: [],
    documents: [],
    requirements: [],
    levels: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    userActions: [],
    failures: [],
  };
  const catalogCandidates: PipelineResult['catalogCandidates'] = [];

  // 1. Reusable knowledge first: an identical vehicle class needs no new research.
  // Only knowledge whose vehicle-class scope can apply to this vehicle.
  const known = currentRequirements(deps.catalog).filter(
    (r) => assessEvidence(r, facts).level !== null,
  );
  const knownResolved = resolveRequirements(known, facts).filter(
    (r) => r.status === 'resolved' && r.level && DRIVING.includes(r.level),
  );
  trace.catalogHits = knownResolved.length;
  trace.catalogKnown = known.length;
  const requirements: MaintenanceRequirement[] = [...known];
  // Documents whose exact bytes already produced verified knowledge: never extracted again.
  const knownShas = new Set(known.flatMap((r) => r.evidence.map((e) => e.documentSha256)));
  let versions: DocumentVersion[] = [...(deps.versions ?? [])];

  if (knownResolved.length === 0) {
    // 2. Discovery.
    const leads: SourceLead[] = [];
    for (const adapter of deps.adapters) {
      const outcome: DiscoveryOutcome = await adapter
        .discover(v, deps)
        .catch((e): DiscoveryOutcome => ({
          adapter: adapter.id,
          leads: [],
          blocked: [],
          notes: [`adapter error: ${String(e)}`],
        }));
      trace.discovery.push(outcome);
      trace.userActions.push(...(outcome.userActions ?? []));
      leads.push(...outcome.leads);
    }

    // 3. Acquisition → understanding → extraction.
    // Runtime source priority: a direct Israeli schedule is read before a 500-page manual, and a
    // lower-priority source is not read once a higher one produced grounded requirements.
    const ordered = [...leads].sort((a, b) => (a.priority ?? 6) - (b.priority ?? 6));
    let satisfiedAt: number | null = null;
    for (const lead of ordered.slice(0, deps.maxDocuments ?? 6)) {
      if (satisfiedAt != null && (lead.priority ?? 6) > satisfiedAt) break;
      // Never download what may not be machine-read: extraction has its own policy dimension.
      const leadSystem = lead.upload ? null : systemForHost(hostOf(lead.url) ?? '', deps.registry);
      if (leadSystem) {
        const reason = policyBlock(
          policyOf(leadSystem).dimensions.automatedExtractionAllowed.value,
        );
        if (reason) {
          trace.discovery.push({
            adapter: 'policy',
            leads: [],
            blocked: [{ url: lead.url, reason, detail: 'automatedExtractionAllowed' }],
            notes: [],
          });
          continue;
        }
      }
      const got = await acquire(lead, deps);
      if (!got.ok) {
        trace.discovery.push({
          adapter: 'acquisition',
          leads: [],
          blocked: [got.blocked],
          notes: [],
        });
        continue;
      }
      // A private upload whose bytes equal a known official document version inherits that
      // document's source system (authority); otherwise it stays an unverified user document.
      const matched = got.doc.lead.upload
        ? versions.find((x) => x.sha256 === got.doc.sha256 && x.sourceSystemId)
        : undefined;
      const doc = matched
        ? {
            ...got.doc,
            system: deps.registry.find((x) => x.sourceSystemId === matched.sourceSystemId) ?? null,
          }
        : got.doc;
      const system = doc.system;
      const authoritative =
        !!system &&
        (system.status === 'approved' ||
          (system.status === 'proposed' && !!deps.assumeProposedApproved));
      const record: VehicleRunTrace['documents'][number] = {
        url: doc.finalUrl,
        sha256: doc.sha256,
        format: doc.format,
        host: doc.host,
        authority: system
          ? system.authorityClass
          : doc.lead.upload
            ? 'user_upload'
            : 'unregistered',
        sourceSystemId: system?.sourceSystemId ?? null,
        registryStatus: system ? system.status : 'unregistered',
        profile: null,
        vehicleMatch: 'unresolved',
        unresolved: [],
        sections: [],
        extracted: 0,
        grounded: 0,
      };
      trace.documents.push(record);
      if (matched) record.officialMatch = matched.documentKey;
      // Versioning (official documents only; private uploads never enter the version store).
      if (!doc.lead.upload) {
        const rec = recordDocumentVersion(versions, {
          sourceSystemId: system?.sourceSystemId ?? null,
          url: doc.finalUrl,
          sha256: doc.sha256,
          at: deps.today,
        });
        versions = rec.store;
        record.version = rec.current.version;
        record.versionStatus = rec.status;
      }
      if (knownShas.has(doc.sha256)) {
        // Unchanged bytes of a document already turned into verified knowledge: reuse, no re-read.
        record.reused = true;
        continue;
      }
      let pages;
      try {
        pages = await (doc.format === 'pdf' ? deps.readers.pdf : deps.readers.html).read(doc);
      } catch (e) {
        record.failure = 'PDF_PARSE_FAILURE';
        record.failureDetail = `text extraction failed: ${String(e).slice(0, 120)}`;
        continue;
      }
      if (!pages.some((p) => p.text.trim())) {
        record.failure = 'PDF_PARSE_FAILURE';
        record.failureDetail = 'no text layer';
        continue;
      }
      const profile = profileDocument(doc, pages, v);
      record.profile = profile;
      if (!profile.models.length) {
        record.unresolved.push(
          profile.modelVariants.length
            ? `model (document names a variant: ${profile.modelVariants.join(', ')})`
            : 'model',
        );
      }
      if (profile.yearFrom == null) record.unresolved.push('modelYear');
      else if (
        v.modelYear < profile.yearFrom ||
        v.modelYear > (profile.yearTo ?? profile.yearFrom)
      ) {
        record.vehicleMatch = 'mismatch';
        record.failure = 'MODEL_YEAR_NOT_LISTED';
        record.failureDetail = `document covers ${profile.yearFrom}–${profile.yearTo}`;
        continue;
      }
      record.vehicleMatch = record.unresolved.length ? 'unresolved' : 'exact';
      const sections = findMaintenanceSections(pages);
      record.sections = sections;
      if (!sections.length) {
        record.failure = 'MAINTENANCE_TABLE_NOT_FOUND';
        record.failureDetail = 'no maintenance schedule section found';
        continue;
      }
      const { extracted } = extractRequirements({
        doc,
        pages,
        sections,
        profile,
        vehicle: v,
        authoritative,
        today: deps.today,
      });
      record.extracted = extracted.length;
      for (const e of extracted) {
        if (ground(e, pages)) record.grounded += 1;
        requirements.push(e.requirement);
        // Shared knowledge only from official retrievals whose source allows storing structured
        // facts — never from a private upload (even one matching an official version).
        if (
          e.requirement.verification === 'verified' &&
          !doc.lead.upload &&
          system &&
          permits(policyOf(system), 'structuredFactsStorageAllowed')
        ) {
          catalogCandidates.push({
            requirement: e.requirement,
            source: {
              url: doc.finalUrl,
              host: doc.host,
              sha256: doc.sha256,
              authority: e.requirement.authority,
              markets: profile.markets,
              edition: profile.edition,
              retrievedAt: deps.today,
            },
          });
        }
      }
      // An Israeli DIRECT maintenance schedule (priority 2) that resolves makes the long manuals
      // unnecessary; lower priorities still fill items per task (per-item override).
      if (
        lead.priority === 2 &&
        resolveRequirements(requirements, facts).some((r) => r.status === 'resolved')
      ) {
        satisfiedAt ??= 2;
      }
      if (!extracted.length) {
        record.failure = 'MAINTENANCE_TABLE_NOT_FOUND';
        record.failureDetail = 'maintenance section found but no atomic requirement could be read';
      }
    }
  }

  // 4. Evidence levels + per-task resolution.
  const resolutions = resolveRequirements(requirements, facts);
  trace.requirements = requirements;
  for (const r of resolutions) {
    for (const c of r.considered) if (c.level) trace.levels[c.level] += 1;
  }
  trace.failures = classifyFailures(trace, resolutions);
  return { trace, resolutions, catalogCandidates, versions };
}

/**
 * Why a vehicle did not get a usable plan, in the standard M-SOURCE failure codes — engine-level
 * reasons, never per model. Each entry names what failed (system, host or task).
 */
export function classifyFailures(
  trace: VehicleRunTrace,
  resolutions: TaskResolution[],
): { class: FailureClass; detail: string }[] {
  const out: { class: FailureClass; detail: string }[] = [];
  const add = (c: FailureClass, detail: string) => {
    if (!out.some((o) => o.class === c && o.detail === detail)) out.push({ class: c, detail });
  };
  const usable = resolutions.some((r) => r.status === 'resolved');
  if (usable && trace.documents.length === 0 && trace.catalogHits > 0) return out;

  const notes = trace.discovery.flatMap((d) => d.notes);
  if (notes.some((n) => n.startsWith('unsupported_manufacturer'))) {
    add('NO_DIGITAL_SOURCE', 'no registered source system for this manufacturer');
  }
  for (const f of trace.discovery.flatMap((d) => d.failures ?? [])) {
    add(f.code, `${f.sourceSystemId}: ${f.detail}`);
  }
  for (const b of trace.discovery.flatMap((d) => d.blocked)) {
    add(
      failureOfBlock(b.reason),
      `${safeHost(b.url)}: ${b.reason}${b.detail ? ` (${b.detail})` : ''}`,
    );
  }
  for (const d of trace.documents)
    if (d.failure) add(d.failure, `${d.host}: ${d.failureDetail ?? ''}`);
  const leads = trace.discovery.flatMap((d) => d.leads);
  if (!leads.length && !out.length) add('NO_DIGITAL_SOURCE', 'no candidate document found');

  for (const r of resolutions) {
    if (r.status === 'conflicting') add('OTHER', `conflicting evidence: ${r.task}/${r.action}`);
    if (r.status !== 'insufficient_information') continue;
    for (const m of r.missing) {
      if (
        m === 'engineCode' ||
        m === 'engineFamily' ||
        m === 'displacementCc' ||
        m === 'powertrain'
      ) {
        add('ENGINE_AMBIGUOUS', `${r.task}: ${m}`);
      } else if (m === 'market') add('MARKET_AMBIGUOUS', r.task);
      else if (m === 'generation' || m === 'model' || m === 'transmission') {
        add('VARIANT_AMBIGUOUS', `${r.task}: ${m}`);
      } else add('OTHER', `${r.task}: ${m} unknown`);
    }
    const cov = [...new Set(r.considered.flatMap((c) => c.applicability.coverageUnknown ?? []))];
    if (cov.includes('modelYear'))
      add('MODEL_YEAR_NOT_LISTED', 'the document does not state its model years');
    if (cov.includes('model'))
      add('VARIANT_AMBIGUOUS', 'the document does not name this exact model');
  }
  return out;
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
