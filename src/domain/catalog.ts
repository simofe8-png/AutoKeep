import type { IsoDate } from './core';
import {
  isVerifiedRequirement,
  type MaintenanceRequirement,
  type MarketCode,
  type RequirementApplicability,
  type RequirementAuthority,
} from './requirements';

/**
 * Reusable maintenance knowledge (owner instruction 2026-09-29). A sufficiently verified atomic
 * requirement is stored ONCE at the vehicle-class scope its source proves (make / model / years /
 * engine / powertrain / market / regime / usage) — never keyed by plate, VIN, user or account —
 * so the next identical vehicle reuses it before any new internet research.
 *
 * Each entry keeps its source version (URL + sha256 + edition), verification date, authority,
 * market, applicability, superseded state and conflicts. Pure: no I/O.
 */

export interface KnowledgeSource {
  url: string;
  host: string;
  sha256: string;
  authority: RequirementAuthority;
  markets: MarketCode[];
  edition?: string;
  retrievedAt: IsoDate;
}

export interface KnowledgeEntry {
  id: string;
  scopeKey: string;
  requirement: MaintenanceRequirement;
  source: KnowledgeSource;
  verifiedAt: IsoDate;
  /** A newer edition of the same source replaced this entry (kept for provenance, not used). */
  supersededBy: string | null;
  /** Entries at the same scope and task that state a different obligation. */
  conflictsWith: string[];
}

const low = (xs?: readonly string[]) =>
  xs ? [...xs].map((x) => x.trim().toLowerCase()).sort() : undefined;

/** Canonical vehicle-class scope of a requirement — deterministic, and personal-data free. */
export function scopeKeyOf(a: RequirementApplicability): string {
  return JSON.stringify({
    kinds: low(a.kinds),
    makes: low(a.makes),
    models: low(a.models),
    generations: low(a.generations),
    years: a.modelYears ?? null,
    engineFamilies: low(a.engineFamilies),
    engineCodes: low(a.engineCodes),
    cc: a.displacementCc ?? null,
    powertrains: low(a.powertrains),
    transmissions: low(a.transmissions),
    markets: low(a.markets),
    regimes: low(a.serviceRegimes),
    usage: a.usage ?? null,
    coverageUnknown: low(a.coverageUnknown),
  });
}

const PERSONAL_KEY = /\b(plate|vin|chassis|user|owner|account|email|phone)\b/i;

/** Guard: a scope never carries personal identifiers (defence in depth for future fields). */
export function isPersonalDataFree(scopeKey: string): boolean {
  return !PERSONAL_KEY.test(scopeKey);
}

function sameObligation(a: MaintenanceRequirement, b: MaintenanceRequirement) {
  return a.action === b.action && JSON.stringify(a.interval) === JSON.stringify(b.interval);
}

export interface AdmitResult {
  entries: KnowledgeEntry[];
  added: string[];
  superseded: string[];
  conflicts: [string, string][];
  rejected: { id: string; reason: 'not_verified' | 'personal_scope' }[];
}

/**
 * Admits verified requirements (with the source they came from) to the catalog:
 *  - unverified requirements are rejected (AI or ungrounded output never becomes knowledge);
 *  - the same source host + scope + task + action with a NEW sha256 supersedes the old entry;
 *  - a different obligation at the same scope/task/action from another source is recorded as a
 *    conflict on both entries (resolution happens per vehicle, never by overwriting).
 */
export function admitToCatalog(
  existing: readonly KnowledgeEntry[],
  candidates: readonly { requirement: MaintenanceRequirement; source: KnowledgeSource }[],
  now: IsoDate,
): AdmitResult {
  const entries = existing.map((e) => ({ ...e, conflictsWith: [...e.conflictsWith] }));
  const result: AdmitResult = { entries, added: [], superseded: [], conflicts: [], rejected: [] };
  for (const c of candidates) {
    const r = c.requirement;
    if (!isVerifiedRequirement(r)) {
      result.rejected.push({ id: r.id, reason: 'not_verified' });
      continue;
    }
    const scopeKey = scopeKeyOf(r.applicability);
    if (!isPersonalDataFree(scopeKey)) {
      result.rejected.push({ id: r.id, reason: 'personal_scope' });
      continue;
    }
    if (entries.some((e) => e.id === r.id)) continue;
    const peers = entries.filter(
      (e) =>
        !e.supersededBy &&
        e.scopeKey === scopeKey &&
        e.requirement.task === r.task &&
        e.requirement.action === r.action,
    );
    const entry: KnowledgeEntry = {
      id: r.id,
      scopeKey,
      requirement: r,
      source: c.source,
      verifiedAt: now,
      supersededBy: null,
      conflictsWith: [],
    };
    for (const p of peers) {
      if (p.source.host === c.source.host && p.source.sha256 !== c.source.sha256) {
        p.supersededBy = entry.id;
        result.superseded.push(p.id);
      } else if (!sameObligation(p.requirement, r)) {
        p.conflictsWith.push(entry.id);
        entry.conflictsWith.push(p.id);
        result.conflicts.push([p.id, entry.id]);
      }
    }
    entries.push(entry);
    result.added.push(entry.id);
  }
  return result;
}

/** Current (non-superseded) requirements of the catalog. */
export function currentRequirements(entries: readonly KnowledgeEntry[]): MaintenanceRequirement[] {
  return entries.filter((e) => !e.supersededBy).map((e) => e.requirement);
}
