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
  namesVehicleMarket,
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
  /**
   * A = the vehicle's market (Israel) is named by the source; B = manufacturer, market unproven;
   * T = triangulated from independent sources (confidence high / medium);
   * O = entered by hand by the owner (owner decision 2026-10-04).
   */
  level: 'A' | 'B' | 'T' | 'O';
  /** The owner's own item (O): its id. */
  manualId?: string;
  confidence: 'high' | 'medium';
  due: RequirementDue;
  /** Id that links a recorded service action to this task on this vehicle (completion). */
  completionId: string;
  lastCompletion: (Completion & { serviceEventId: string }) | null;
}

/** What to photograph: generic, or the vehicle's service-plan code when a source requires it. */
export type BookletHint = 'service_plan_code' | 'generic';

export type EvidenceRequest =
  | { kind: 'upload_booklet'; hint: BookletHint }
  /** The vehicle's service-plan code; `codes` = the codes the sources themselves name. */
  | { kind: 'service_regime'; hint: BookletHint; codes: string[] }
  | { kind: 'usage' }
  | { kind: 'engine_code' }
  | { kind: 'in_service_date' }
  | { kind: 'odometer' }
  | { kind: 'awaiting_verification'; sources: { title: string; publishedOn?: IsoDate }[] }
  /** The document found does not state the vehicle's model years. */
  | { kind: 'model_year_unproven' };

/**
 * Why no schedule could be built (§24 fallback). Recorded so the same search failure can be
 * improved later — the record carries the vehicle CLASS only, never a vehicle, plate or VIN.
 */
export type DiscoveryMissReason =
  | 'unknown_make'
  | 'model_year_unproven'
  | 'awaiting_verification'
  | 'missing_vehicle_fact'
  | 'no_applicable_requirement'
  /** Some items are established, but not the service / oil interval. */
  | 'no_service_interval';

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

/** Completion link of one of the owner's custom items (tracked on its own, by its id). */
export function manualCompletionId(vehicleId: string, itemId: string): string {
  const key = `autokeep:manual-item:${vehicleId}:${itemId}`;
  const hex = [0x811c9dc5, 0x01234567, 0x89abcdef, 0x13579bdf]
    .map((seed) => fnv1a(key, seed).toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface ManualPlanItem {
  id: string;
  /** Not one of the known tasks: tracked on its own. */
  custom: boolean;
  requirement: MaintenanceRequirement;
  /** When it was last done, as the owner stated it. */
  lastDone: { date: IsoDate; odometerKm: number } | null;
  /** Without any last service: count from here (the odometer and date at entry). */
  startFrom?: { date: IsoDate; odometerKm: number } | null;
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

// ---------- market across the service family ----------

const SERVICE_FAMILY: readonly TaskCode[] = ['periodic_service', 'engine_oil', 'oil_filter'];

function foreignOnly(r: MaintenanceRequirement, f: VehicleFacts): boolean {
  const ms = (r.applicability.markets ?? []).map((m) => m.toUpperCase());
  return ms.length > 0 && f.market != null && !ms.includes(f.market) && !ms.includes('GLOBAL');
}

// ---------- completeness ----------

/**
 * The core periodic items a schedule must cover before it may be called complete (one entry =
 * any of its tasks). Anything less is PARTIAL, whatever the individual items' evidence.
 */
export function coreTasks(f: VehicleFacts): TaskCode[][] {
  const service: TaskCode[] = ['engine_oil', 'periodic_service'];
  if (f.kind === 'motorcycle') return [service, ['spark_plugs'], ['air_filter']];
  if (f.powertrain === 'electric') return [['brake_fluid'], ['cabin_filter']];
  if (f.powertrain === 'diesel') return [service, ['brake_fluid'], ['air_filter'], ['coolant']];
  if (f.powertrain === 'petrol' || f.powertrain === 'hybrid') {
    return [service, ['brake_fluid'], ['air_filter'], ['spark_plugs'], ['coolant']];
  }
  return [service, ['brake_fluid']];
}

/**
 * A core item is covered by an item that DOES the work (an oil inspection is not an oil change);
 * the periodic service itself and every item of an electric vehicle count as they are stated.
 */
/** The plan states when to service the vehicle (an EV: any established item). */
export function hasServiceInterval(
  f: VehicleFacts,
  items: readonly { task: TaskCode; requirement: { action: RequirementAction } }[],
): boolean {
  if (f.powertrain === 'electric') return items.length > 0;
  return !missingCoreTasks(f, items).some((any) => any.includes('periodic_service'));
}

export function missingCoreTasks(
  f: VehicleFacts,
  items: readonly { task: TaskCode; requirement: { action: RequirementAction } }[],
) {
  const does = (i: (typeof items)[number]) =>
    f.powertrain === 'electric' ||
    i.task === 'periodic_service' ||
    i.requirement.action !== 'inspection';
  return coreTasks(f).filter((any) => !items.some((i) => any.includes(i.task) && does(i)));
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
    if (r.kind === 'model_year_unproven' || r.kind === 'awaiting_verification') {
      out.add(r.kind);
    } else if (r.kind === 'service_regime' || r.kind === 'usage' || r.kind === 'engine_code') {
      out.add('missing_vehicle_fact');
    }
  }
  if (!unresolved.length && !out.size) out.add('no_applicable_requirement');
  return [...out].sort();
}

// ---------- the plan ----------

/**
 * Generic for every manufacturer: when an applicable source depends on a service-plan code, the
 * hint asks for the code (data sticker / booklet cover); otherwise the schedule pages.
 */
export function bookletHint(requirements: readonly MaintenanceRequirement[]): BookletHint {
  return requirements.some((r) => r.applicability.serviceRegimes?.length)
    ? 'service_plan_code'
    : 'generic';
}

const STATE_RANK = { overdue: 0, due: 1, upcoming: 2, ok: 3, completed: 9 } as const;

export function buildMaintenancePlan(input: {
  vehicle: PlanVehicle;
  profile: PlanProfile | null;
  requirements: readonly MaintenanceRequirement[];
  history: readonly PlanHistoryEvent[];
  readings: readonly { date: IsoDate; km: number }[];
  today: IsoDate;
  /**
   * Items the owner entered by hand: the owner's word for that item — any other source's item
   * for the same task and action is replaced. A custom item is tracked on its own.
   */
  manual?: readonly ManualPlanItem[];
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
      level: r.level === 'A' ? 'A' : r.level === 'T' ? 'T' : 'B',
      // Individually verified official evidence is high confidence; T carries its own.
      confidence:
        r.level === 'T'
          ? r.effective.corroboration?.confidence === 'high'
            ? 'high'
            : 'medium'
          : 'high',
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

  // Market first, across the service family: when the vehicle's own market states the service /
  // oil interval, another market's service or oil interval is not shown beside it (e.g. a UK
  // 10,000-mile oil change next to the Israeli 15,000 km service).
  const localService = items.some(
    (i) => SERVICE_FAMILY.includes(i.task) && namesVehicleMarket(i.requirement, facts),
  );
  if (localService) {
    for (let k = items.length - 1; k >= 0; k -= 1) {
      const i = items[k];
      if (SERVICE_FAMILY.includes(i.task) && foreignOnly(i.requirement, facts)) items.splice(k, 1);
    }
  }

  // The owner's own items replace any other source's item for the same task and action.
  for (const m of input.manual ?? []) {
    const r = m.requirement;
    if (!m.custom) {
      const same = (x: { task: TaskCode; action: RequirementAction }) =>
        x.task === r.task && x.action === r.action;
      for (let k = items.length - 1; k >= 0; k -= 1) {
        if (same({ task: items[k].task, action: items[k].requirement.action })) items.splice(k, 1);
      }
      for (let k = unresolved.length - 1; k >= 0; k -= 1) {
        if (same(unresolved[k])) unresolved.splice(k, 1);
      }
    }
    const completionId = m.custom
      ? manualCompletionId(input.vehicle.id, m.id)
      : taskCompletionId(input.vehicle.id, r.task, r.action);
    const recorded = lastCompletionOf(completionId, input.history);
    const stated = m.lastDone ? { ...m.lastDone, serviceEventId: '' } : null;
    const lastCompletion =
      recorded && (!stated || compareDates(recorded.date, stated.date) >= 0) ? recorded : stated;
    items.push({
      task: r.task,
      requirement: r,
      resolution: {
        task: r.task,
        action: r.action,
        status: 'resolved',
        reason: 'owner_entered',
        effective: r,
        level: null,
        missing: [],
        considered: [],
      },
      level: 'O',
      confidence: 'high',
      manualId: m.id,
      completionId,
      lastCompletion,
      due: computeRequirementDue({
        requirement: r,
        today: input.today,
        readings: input.readings,
        inServiceDate: facts.inServiceDate ?? null,
        lastCompletion,
        startFrom: m.startFrom ?? null,
      }),
    });
  }

  // What is missing — the exact next actions, never an invented interval.
  const forMake = input.requirements.filter(
    (r) =>
      !r.applicability.makes ||
      (facts.make != null &&
        r.applicability.makes.some((m) => m.toLowerCase() === facts.make!.toLowerCase())),
  );
  const hint = bookletHint(forMake);
  const requests: EvidenceRequest[] = [];
  const add = (r: EvidenceRequest) => {
    if (!requests.some((x) => JSON.stringify(x) === JSON.stringify(r))) requests.push(r);
  };
  const needsFallback = items.length === 0 || !hasServiceInterval(facts, items);
  if (needsFallback) {
    add({ kind: 'upload_booklet', hint });
  }
  for (const r of unresolved) {
    for (const d of r.missing) {
      if (d === 'serviceRegime') {
        // The codes the sources themselves name (never a fixed list of one manufacturer's codes).
        const codes = [
          ...new Set(
            r.considered.flatMap((c) =>
              (c.requirement.applicability.serviceRegimes ?? []).filter((x) =>
                /^[A-Z]{1,3}\d{1,2}$/.test(x),
              ),
            ),
          ),
        ].sort();
        add({ kind: 'service_regime', hint, codes });
      } else if (d === 'usage') add({ kind: 'usage' });
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
    status:
      items.length === 0
        ? 'needs_information'
        : unresolved.length || missingCoreTasks(facts, items).length
          ? 'partial'
          : 'ready',
    // §24: no schedule, or no established service interval (the item a plan is most used for) →
    // the dealer / upload fallback; established items are still shown, labelled PARTIAL.
    fallback: needsFallback
      ? {
          reasons: [
            ...missReasons(facts, requests, unresolved),
            ...(items.length ? (['no_service_interval'] as const) : []),
          ].sort(),
          classKey: vehicleClassKey(facts),
        }
      : null,
    items,
    unresolved,
    requests,
    next,
  };
}
