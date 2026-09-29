import {
  currentRequirements,
  type EvidenceLevel,
  type IsoDate,
  type KnowledgeEntry,
  type KnowledgeSource,
  type MaintenanceRequirement,
} from '@/domain';
import { assessEvidence, resolveRequirements, type TaskResolution } from '@/engine/requirements';

import { acquire } from './access';
import { findMaintenanceSections, profileDocument } from './classify';
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
}

export interface PipelineResult {
  trace: VehicleRunTrace;
  resolutions: TaskResolution[];
  /** Verified requirements whose source allows reuse — candidates for the knowledge catalog. */
  catalogCandidates: { requirement: MaintenanceRequirement; source: KnowledgeSource }[];
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
    for (const lead of leads.slice(0, deps.maxDocuments ?? 6)) {
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
      const doc = got.doc;
      const entry = doc.registryEntry;
      const authoritative =
        !!entry &&
        (entry.status === 'approved' ||
          (entry.status === 'proposed' && !!deps.assumeProposedApproved));
      const record: VehicleRunTrace['documents'][number] = {
        url: doc.finalUrl,
        sha256: doc.sha256,
        format: doc.format,
        host: doc.host,
        authority: entry ? entry.role : 'unregistered',
        registryStatus: entry ? entry.status : 'unregistered',
        profile: null,
        vehicleMatch: 'unresolved',
        unresolved: [],
        sections: [],
        extracted: 0,
        grounded: 0,
      };
      trace.documents.push(record);
      let pages;
      try {
        pages = await (doc.format === 'pdf' ? deps.readers.pdf : deps.readers.html).read(doc);
      } catch (e) {
        record.failure = 'document_parsing_failure';
        record.failureDetail = `text extraction failed: ${String(e).slice(0, 120)}`;
        continue;
      }
      if (!pages.some((p) => p.text.trim())) {
        record.failure = 'document_parsing_failure';
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
        record.failure = 'vehicle_identity_insufficient';
        record.failureDetail = `document covers ${profile.yearFrom}–${profile.yearTo}`;
        continue;
      }
      record.vehicleMatch = record.unresolved.length ? 'unresolved' : 'exact';
      const sections = findMaintenanceSections(pages);
      record.sections = sections;
      if (!sections.length) {
        record.failure = 'document_parsing_failure';
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
        if (e.requirement.verification === 'verified' && entry?.reuse === 'permitted') {
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
      if (!extracted.length) {
        record.failure = 'document_parsing_failure';
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
  return { trace, resolutions, catalogCandidates };
}

const ACCESS: string[] = ['terms_prohibit_automation', 'terms_unknown', 'registry_not_approved'];
const BLOCKED: string[] = [
  'robots_disallow',
  'login_or_bot_wall',
  'http_error',
  'network_error',
  'not_a_document',
  'too_large',
  'not_https',
];

/** Why a vehicle did not get a usable plan — engine-level failure classes, never per model. */
export function classifyFailures(
  trace: VehicleRunTrace,
  resolutions: TaskResolution[],
): { class: FailureClass; detail: string }[] {
  const out: { class: FailureClass; detail: string }[] = [];
  const add = (c: FailureClass, detail: string) => {
    if (!out.some((o) => o.class === c && o.detail === detail)) out.push({ class: c, detail });
  };
  const resolved = resolutions.filter((r) => r.status === 'resolved');
  if (resolved.length > 0 && trace.documents.length === 0 && trace.catalogHits > 0) return out;

  const notes = trace.discovery.flatMap((d) => d.notes);
  if (notes.some((n) => n.startsWith('unsupported_manufacturer'))) {
    add('unsupported_manufacturer', 'no registered official host for this manufacturer');
  }
  const blocked = trace.discovery.flatMap((d) => d.blocked);
  for (const b of blocked) {
    if (ACCESS.includes(b.reason)) add('access_restriction', `${new URL(b.url).host}: ${b.reason}`);
    else if (BLOCKED.includes(b.reason))
      add('blocked_source', `${safeHost(b.url)}: ${b.reason}${b.detail ? ` (${b.detail})` : ''}`);
  }
  for (const d of trace.documents)
    if (d.failure) add(d.failure, `${d.host}: ${d.failureDetail ?? ''}`);
  const leads = trace.discovery.flatMap((d) => d.leads);
  if (!leads.length && !blocked.length && !out.length)
    add('no_source', 'no candidate document found');
  if (leads.length && !trace.documents.length && !blocked.length)
    add('no_source', 'leads found but none retrieved');

  for (const r of resolutions) {
    if (r.status === 'conflicting') add('conflicting_evidence', r.task);
    if (r.status === 'insufficient_information') {
      for (const m of r.missing) {
        if (
          m === 'engineCode' ||
          m === 'engineFamily' ||
          m === 'displacementCc' ||
          m === 'powertrain'
        ) {
          add('engine_ambiguity', `${r.task}: ${m}`);
        } else if (m === 'serviceRegime') add('service_regime_ambiguity', r.task);
        else if (m === 'market') add('market_ambiguity', r.task);
      }
      const cov = r.considered.flatMap((c) => c.applicability.coverageUnknown ?? []);
      if (cov.length)
        add(
          'vehicle_identity_insufficient',
          `document coverage unstated: ${[...new Set(cov)].join(', ')}`,
        );
    }
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
