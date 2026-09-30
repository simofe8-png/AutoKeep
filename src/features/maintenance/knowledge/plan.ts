import { officialSourcesFor, type OfficialSourceStatus } from '@/discovery/maintenance/fallback';
import { SOURCE_SYSTEMS } from '@/discovery/maintenance/registry/israelSources';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';
import { normalizeManufacturer } from '@/discovery/authority';
import {
  compareDates,
  type IsoDate,
  type MaintenanceRequirement,
  type Powertrain,
  type RequirementAction,
  type TaskCode,
  type VehicleFacts,
  type VehicleType,
} from '@/domain';
import {
  computeRequirementDue,
  resolveRequirements,
  type Completion,
  type RequirementDue,
  type TaskResolution,
} from '@/engine/requirements';

/**
 * The per-vehicle maintenance plan (Tasks 7–10): vehicle facts × requirements → resolution →
 * deterministic dues, plus the exact information still missing. Pure — no I/O.
 */

export interface PlanVehicle {
  id: string;
  kind: VehicleType;
  manufacturer: string;
  model: string;
  year: number;
  engine?: string;
  engineCode?: string;
  fuel?: string;
}

export interface PlanProfile {
  inServiceDate: IsoDate | null;
  serviceRegime: string | null;
  usage: 'normal' | 'severe' | null;
}

export interface PlanHistoryEvent {
  id: string;
  date: IsoDate;
  odometerKm: number;
  actions: { performed: boolean; maintenanceItemId?: string | null }[];
}

export interface PlanItem {
  task: TaskCode;
  requirement: MaintenanceRequirement;
  resolution: TaskResolution;
  /** A = the vehicle's market (Israel) is named by the source; B = manufacturer, market unproven. */
  level: 'A' | 'B';
  due: RequirementDue;
  /** Id that links a recorded service action to this task on this vehicle (completion). */
  completionId: string;
  lastCompletion: (Completion & { serviceEventId: string }) | null;
}

export type BookletHint = 'seat_maintenance_programme' | 'ford_service_plan' | 'generic';

export type EvidenceRequest =
  | { kind: 'upload_booklet'; hint: BookletHint }
  | { kind: 'service_regime'; hint: BookletHint }
  | { kind: 'usage' }
  | { kind: 'engine_code' }
  | { kind: 'in_service_date' }
  | { kind: 'odometer' }
  | { kind: 'awaiting_verification'; sources: { title: string; publishedOn?: IsoDate }[] }
  /** Approved official pages the USER can open (AutoKeep may not fetch them automatically). */
  /** Approved official sources of the make with the precise reason AutoKeep cannot read them. */
  | { kind: 'official_source'; sources: OfficialSourceStatus[] }
  /** No official source system is known for the make. */
  | { kind: 'no_official_source' }
  /** An official source was identified but is not yet approved as a trusted source. */
  | { kind: 'official_source_pending' }
  /** The document found does not state the vehicle's model years. */
  | { kind: 'model_year_unproven' };

/**
 * Why no schedule could be built (§24 fallback). Recorded so the same search failure can be
 * improved later — the record carries the vehicle CLASS only, never a vehicle, plate or VIN.
 */
export type DiscoveryMissReason =
  | Exclude<OfficialSourceStatus['reason'], 'automatic'>
  | 'no_official_source'
  | 'official_source_pending'
  | 'unknown_make'
  | 'model_year_unproven'
  | 'awaiting_verification'
  | 'missing_vehicle_fact'
  | 'no_applicable_requirement';

export interface PlanFallback {
  /** Sorted, de-duplicated reasons. */
  reasons: DiscoveryMissReason[];
  /** Vehicle-class key: kind|make|model|year|engine code — nothing that identifies a vehicle. */
  classKey: string;
}

export interface MaintenancePlan {
  facts: VehicleFacts;
  /**
   * ready = every applicable requirement resolved; partial = a useful but INCOMPLETE schedule
   * (must be labelled partial); needs_information = no reliable schedule → `fallback`.
   */
  status: 'ready' | 'partial' | 'needs_information';
  /** Set exactly when no item could be scheduled: the explicit user fallback (§24). */
  fallback: PlanFallback | null;
  items: PlanItem[];
  unresolved: TaskResolution[];
  requests: EvidenceRequest[];
  /** The most urgent item(s): the next service. */
  next: PlanItem[];
}

// ---------- vehicle facts ----------

const HEBREW = /[֐-׿]/;

/** Normalized make, or undefined when it cannot be established (never a Hebrew free-text guess). */
export function makeOf(manufacturer: string): string | undefined {
  const n = normalizeManufacturer(manufacturer, MANUFACTURER_ALIASES);
  return n && !HEBREW.test(n) ? n : undefined;
}

export function powertrainOf(fuel: string | undefined): Powertrain | undefined {
  if (!fuel) return undefined;
  const f = fuel.trim();
  if (/היבריד|hybrid/i.test(f)) return 'hybrid';
  if (/חשמל|electric/i.test(f)) return 'electric';
  if (/דיזל|סולר|diesel/i.test(f)) return 'diesel';
  if (/בנזין|petrol|gasoline/i.test(f)) return 'petrol';
  return undefined;
}

/** Displacement in cc only when stated in cc ("1390 סמ״ק"); a litre label is not converted. */
export function displacementOf(engine: string | undefined): number | undefined {
  const m = engine?.match(/^\s*(\d{2,5})\s*(סמ|cc)/i);
  return m ? Number(m[1]) : undefined;
}

export function factsOf(v: PlanVehicle, p: PlanProfile | null): VehicleFacts {
  return {
    kind: v.kind,
    make: makeOf(v.manufacturer),
    model: v.model?.trim() || undefined,
    modelYear: v.year > 0 ? v.year : undefined,
    engineCode: v.engineCode?.trim() || undefined,
    displacementCc: displacementOf(v.engine),
    powertrain: powertrainOf(v.fuel),
    // Vehicles in AutoKeep are Israeli-registered (plate + data.gov.il): the market is a fact.
    market: 'IL',
    serviceRegime: p?.serviceRegime ?? undefined,
    usage: p?.usage ?? undefined,
    inServiceDate: p?.inServiceDate ?? undefined,
  };
}

// ---------- completion link ----------

function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic UUID (version 8, custom) for "task X on vehicle Y". Stored in the existing,
 * synced service_actions.maintenance_item_id, so a recorded completion links to exactly one
 * task of exactly one vehicle.
 */
/**
 * Completion link of one obligation on one vehicle. Inspection and adjustment obligations get
 * their own id; replacement / other keep the task-level id (stable for completions recorded
 * before per-action resolution, 2026-09-29).
 */
export function taskCompletionId(
  vehicleId: string,
  task: TaskCode,
  action?: RequirementAction,
): string {
  const suffix = action === 'inspection' || action === 'adjustment' ? `:${action}` : '';
  const key = `autokeep:maintenance-task:${vehicleId}:${task}${suffix}`;
  const hex = [0x811c9dc5, 0x01234567, 0x89abcdef, 0x13579bdf]
    .map((seed) => fnv1a(key, seed).toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function lastCompletionOf(
  completionId: string,
  history: readonly PlanHistoryEvent[],
): (Completion & { serviceEventId: string }) | null {
  let best: (Completion & { serviceEventId: string }) | null = null;
  for (const e of history) {
    if (!e.actions.some((a) => a.performed && a.maintenanceItemId === completionId)) continue;
    if (
      !best ||
      compareDates(e.date, best.date) > 0 ||
      (e.date === best.date && e.odometerKm > best.odometerKm)
    ) {
      best = { date: e.date, odometerKm: e.odometerKm, serviceEventId: e.id };
    }
  }
  return best;
}

// ---------- official sources (registry data; nothing is fetched) ----------

/** The approved official sources of the vehicle's make, each with the precise fallback reason. */
function identifiedSystems(make: string): number {
  const key = normalizeManufacturer(make, MANUFACTURER_ALIASES);
  return SOURCE_SYSTEMS.filter((x) => x.status === 'proposed' && x.manufacturers.includes(key))
    .length;
}

export function officialSources(facts: VehicleFacts): OfficialSourceStatus[] {
  if (!facts.make) return [];
  return officialSourcesFor(facts.make, SOURCE_SYSTEMS, MANUFACTURER_ALIASES, facts.kind);
}

// ---------- §24 fallback ----------

/** Vehicle-class key of a discovery miss (no vehicle id, plate, VIN or user). */
export function vehicleClassKey(f: VehicleFacts): string {
  return [
    f.kind,
    f.make ?? '?',
    (f.model ?? '?').toLowerCase(),
    f.modelYear ?? '?',
    f.engineCode ?? '',
  ]
    .join('|')
    .replace(/\|$/, '');
}

function missReasons(
  facts: VehicleFacts,
  requests: readonly EvidenceRequest[],
  unresolved: readonly TaskResolution[],
): DiscoveryMissReason[] {
  const out = new Set<DiscoveryMissReason>();
  if (!facts.make) out.add('unknown_make');
  for (const r of requests) {
    if (r.kind === 'official_source') {
      for (const s of r.sources) if (s.reason !== 'automatic') out.add(s.reason);
    } else if (
      r.kind === 'no_official_source' ||
      r.kind === 'official_source_pending' ||
      r.kind === 'model_year_unproven' ||
      r.kind === 'awaiting_verification'
    ) {
      out.add(r.kind);
    } else if (r.kind === 'service_regime' || r.kind === 'usage' || r.kind === 'engine_code') {
      out.add('missing_vehicle_fact');
    }
  }
  if (!unresolved.length && !out.size) out.add('no_applicable_requirement');
  return [...out].sort();
}

// ---------- the plan ----------

export function bookletHint(make: string | undefined): BookletHint {
  if (make === 'seat') return 'seat_maintenance_programme';
  if (make === 'ford') return 'ford_service_plan';
  return 'generic';
}

const STATE_RANK = { overdue: 0, due: 1, upcoming: 2, ok: 3, completed: 9 } as const;

export function buildMaintenancePlan(input: {
  vehicle: PlanVehicle;
  profile: PlanProfile | null;
  requirements: readonly MaintenanceRequirement[];
  history: readonly PlanHistoryEvent[];
  readings: readonly { date: IsoDate; km: number }[];
  today: IsoDate;
}): MaintenancePlan {
  const facts = factsOf(input.vehicle, input.profile);
  const resolutions = resolveRequirements(input.requirements, facts);

  const items: PlanItem[] = [];
  const unresolved: TaskResolution[] = [];
  for (const r of resolutions) {
    if (r.status === 'not_applicable') continue;
    if (r.status !== 'resolved' || !r.effective) {
      unresolved.push(r);
      continue;
    }
    const completionId = taskCompletionId(input.vehicle.id, r.task, r.action);
    const lastCompletion = lastCompletionOf(completionId, input.history);
    items.push({
      task: r.task,
      requirement: r.effective,
      resolution: r,
      level: r.level === 'A' ? 'A' : 'B',
      completionId,
      lastCompletion,
      due: computeRequirementDue({
        requirement: r.effective,
        today: input.today,
        readings: input.readings,
        inServiceDate: facts.inServiceDate ?? null,
        lastCompletion,
      }),
    });
  }

  // What is missing — the exact next actions, never an invented interval.
  const hint = bookletHint(facts.make);
  const requests: EvidenceRequest[] = [];
  const add = (r: EvidenceRequest) => {
    if (!requests.some((x) => JSON.stringify(x) === JSON.stringify(r))) requests.push(r);
  };
  if (items.length === 0) {
    // Sources the pipeline may read automatically are not a user action; the rest are, with why.
    const sources = officialSources(facts).filter((x) => x.reason !== 'automatic');
    if (sources.length) add({ kind: 'official_source', sources });
    else if (!officialSources(facts).length) {
      // Never "not found" when a source is known: an identified, not-yet-approved source says so.
      add(
        facts.make && identifiedSystems(facts.make)
          ? { kind: 'official_source_pending' }
          : { kind: 'no_official_source' },
      );
    }
    add({ kind: 'upload_booklet', hint });
  }
  for (const r of unresolved) {
    for (const d of r.missing) {
      if (d === 'serviceRegime') add({ kind: 'service_regime', hint });
      else if (d === 'usage') add({ kind: 'usage' });
      else if (d === 'engineCode') add({ kind: 'engine_code' });
    }
    if (r.considered.some((c) => c.applicability.coverageUnknown?.includes('modelYear'))) {
      add({ kind: 'model_year_unproven' });
    }
  }
  const awaiting = unresolved
    .filter((r) => r.status === 'unverified_only')
    .flatMap((r) =>
      r.considered
        .filter((c) => c.role === 'unverified' && c.applicability.verdict !== 'does_not_apply')
        .flatMap((c) =>
          c.requirement.evidence.map((e) => ({
            title: e.documentTitle,
            publishedOn: e.publishedOn,
          })),
        ),
    );
  if (awaiting.length) {
    add({
      kind: 'awaiting_verification',
      sources: awaiting.filter((s, i) => awaiting.findIndex((x) => x.title === s.title) === i),
    });
  }
  for (const it of items) {
    if (it.due.status !== 'insufficient_information') continue;
    if (it.due.missing.includes('odometer')) add({ kind: 'odometer' });
    if (it.due.missing.includes('in_service_date')) add({ kind: 'in_service_date' });
  }

  const computed = items.filter((i) => i.due.status === 'computed' && i.due.state !== 'completed');
  const sorted = [...computed].sort((a, b) => {
    const da = a.due.status === 'computed' ? a.due : null;
    const db = b.due.status === 'computed' ? b.due : null;
    return (
      STATE_RANK[da!.state] - STATE_RANK[db!.state] ||
      (da!.remainingDays ?? Infinity) - (db!.remainingDays ?? Infinity) ||
      (da!.remainingKm ?? Infinity) - (db!.remainingKm ?? Infinity)
    );
  });
  const lead = sorted[0];
  const next = lead
    ? sorted.filter((i) => {
        const a = lead.due.status === 'computed' ? lead.due : null;
        const b = i.due.status === 'computed' ? i.due : null;
        const nearKm =
          a?.nextKm != null && b?.nextKm != null ? Math.abs(a.nextKm - b.nextKm) <= 1500 : false;
        const nearDays =
          a?.remainingDays != null && b?.remainingDays != null
            ? Math.abs(a.remainingDays - b.remainingDays) <= 45
            : false;
        return i === lead || nearKm || nearDays;
      })
    : [];

  return {
    facts,
    status: items.length === 0 ? 'needs_information' : unresolved.length ? 'partial' : 'ready',
    fallback:
      items.length === 0
        ? { reasons: missReasons(facts, requests, unresolved), classKey: vehicleClassKey(facts) }
        : null,
    items,
    unresolved,
    requests,
    next,
  };
}
