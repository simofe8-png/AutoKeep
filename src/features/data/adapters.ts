import {
  dateOf,
  displayState,
  formatRegistration,
  type Alert,
  type DeferredItem,
  type DerivedExtraction,
  type GarageRecommendation,
  type IsoDate,
  latestReading,
  type MaintenanceInterval,
  type MaintenanceItem,
  type MaintenanceSchedule,
  type OdometerReading,
  type TaskCode,
  type ServiceEvent,
  type Source,
  type SourceReference,
  type Vehicle,
  type VehicleDocument,
  maskVin,
  type CandidateClaim,
  type MaintenanceRequirement,
  requirementFromClaim,
} from '@/domain';
import type { AlertCandidate } from '@/engine/alerts';
import { buildMaintenancePlan } from '@/features/maintenance/knowledge/plan';
import { toPlanVM } from '@/features/maintenance/knowledge/planVM';
import type {
  MaintenanceProfile,
  ManualScheduleItem,
  StoredKnowledgeDocument,
} from '@/persistence';
import {
  isCustom,
  manualLastDone,
  manualRequirement,
  manualStartFrom,
} from '@/features/maintenance/manualSchedule';
import type { OwnerReviewState } from '@/features/maintenance/msource/ownerReview';
import type { VehicleRegistryRecord } from '@/providers/registry/vehicleRecord';
import type { EngineResult, ItemDue } from '@/engine/maintenance';
import { tablePlan } from '@/engine/serviceTable';
import { isFiesta2012 } from '@/features/maintenance/table/fiesta2012';
import type { StoredServiceTable, StoredTableDone } from '@/persistence/repositories/serviceTable';
import { formatDate, formatKm } from '@/features/vehicles/format';
import type { VehicleSummary } from '@/features/vehicles/types';
import { he } from '@/i18n/he';

import type {
  AlertVM,
  DeferredItemVM,
  DocumentVM,
  ExtractionStatus,
  GarageRecommendationVM,
  MaintenanceItemVM,
  NextServiceVM,
  ScheduleVM,
  ServiceEventVM,
  ServiceTableVM,
  SourceRefVM,
  UpcomingServiceVM,
  VehicleDataBundle,
} from './types';

/**
 * Domain → view-model adapters (T103–T105). Pure and deterministic: the approved UI renders the
 * same view-models it rendered with prototype data, now computed from persisted records and the
 * maintenance engine. Nothing here invents data — an absent fact stays absent.
 */

/** Everything persisted for ONE vehicle (loaded by the local store). */
export interface VehicleRecords {
  vehicle: Vehicle;
  readings: OdometerReading[];
  schedule: MaintenanceSchedule | null;
  sources: Source[];
  history: ServiceEvent[];
  documents: VehicleDocument[];
  extractions: DerivedExtraction[];
  alerts: Alert[];
  garageRecommendations: GarageRecommendation[];
  deferred: DeferredItem[];
  /** Maintenance knowledge (local-only, migration v6). */
  maintenanceProfile?: MaintenanceProfile | null;
  knowledgeDocuments?: StoredKnowledgeDocument[];
  claims?: CandidateClaim[];
  /** The registry record and the owner's own documents (local-only, migration v10). */
  msource?: {
    /** The Ministry record the vehicle was identified by (null when entered by hand). */
    registry?: VehicleRegistryRecord | null;
    /** Items read from the owner's own documents, with the owner's decisions (local only). */
    owner?: OwnerReviewState;
  };
  /** Items the owner entered by hand (local only, migration v15). */
  manualItems?: ManualScheduleItem[];
  /** The owner's maintenance table and what was done by it (local only, migration v19). */
  serviceTable?: StoredServiceTable | null;
  tableDone?: StoredTableDone[];
}

// ---------- T103: vehicle / home ----------

export function toVehicleSummary(v: Vehicle, latest: OdometerReading | null): VehicleSummary {
  return {
    id: v.id,
    kind: v.type,
    manufacturer: v.identity.manufacturer,
    model: v.identity.model,
    year: v.identity.year,
    registration: formatRegistration(v.registration),
    odometerKm: latest?.valueKm ?? 0,
    odometerMeasuredAt: latest?.measuredAt ?? dateOf(v.createdAt),
    archived: v.lifecycle === 'archived',
    trim: v.identity.trim,
    modelCode: v.identity.modelCode,
    engine: v.identity.engine,
    engineCode: v.identity.engineCode,
    fuel: v.identity.fuel,
    color: v.identity.color,
    exteriorPhase: v.identity.exteriorPhase,
    exteriorPhaseSource: v.identity.exteriorPhaseSource,
    vinMasked: v.vin ? maskVin(v.vin) : undefined,
  };
}

// ---------- T105: sources / evidence ----------

/** Exact location inside the source: "עמ׳ 412 · סעיף 6.3 · טבלה 6-1". */
export function locatorOf(ref: SourceReference | undefined): string | undefined {
  if (!ref) return undefined;
  const parts = [
    ref.page !== undefined ? he.data.page(ref.page) : null,
    ref.section ? he.data.section(ref.section) : null,
    ref.table ? he.data.table(ref.table) : null,
    ref.figure ? he.data.figure(ref.figure) : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function toSourceRef(
  schedule: MaintenanceSchedule,
  sources: readonly Source[],
  ref?: SourceReference,
): SourceRefVM | undefined {
  const evidence = schedule.evidence[0];
  if (!evidence) return undefined;
  const reference = ref ?? evidence.reference;
  const source = sources.find((s) => s.id === reference?.sourceId);
  return {
    sourceTitle: source?.title ?? he.data.unknownSource,
    authority: source?.authority ?? evidence.authority,
    locator: ref ? locatorOf(ref) : undefined,
    version: source?.edition,
    documentId: reference?.documentId ?? source?.documentId,
  };
}

// ---------- T104: maintenance ----------

export function intervalLabel(i: MaintenanceInterval): string {
  if (i.rule === 'earliest_of' && i.everyKm !== undefined && i.everyMonths !== undefined) {
    return he.data.earliestOf(formatKm(i.everyKm), i.everyMonths);
  }
  if (i.everyKm !== undefined && i.rule !== 'time_only')
    return he.data.everyKm(formatKm(i.everyKm));
  if (i.everyMonths !== undefined) return he.data.everyMonths(i.everyMonths);
  return i.label;
}

function serviceTitle(dueKm: number | null, fallback: string): string {
  return dueKm !== null ? he.data.serviceAt(formatKm(dueKm)) : fallback;
}

function toItemVM(
  item: MaintenanceItem,
  schedule: MaintenanceSchedule,
  sources: readonly Source[],
): MaintenanceItemVM {
  return {
    id: item.id,
    title: item.title,
    actionType: item.actionType,
    manufacturerText: item.manufacturerText,
    verification: displayState(schedule.verification.state),
    source: toSourceRef(schedule, sources, item.reference),
  };
}

function reasonText(schedule: MaintenanceSchedule | null): string {
  if (!schedule) return he.data.reasonNoSource;
  switch (schedule.verification.state) {
    case 'conflicting':
      return he.data.reasonConflicting;
    case 'unverified':
      return he.data.reasonNotOfficial;
    default:
      return schedule.verification.reason === 'no_evidence'
        ? he.data.reasonNoSource
        : he.data.reasonNotExact;
  }
}

const dueKey = (d: Pick<ItemDue, 'dueKm' | 'dueDate'>) => `${d.dueKm ?? ''}|${d.dueDate ?? ''}`;

export function toScheduleVM(
  schedule: MaintenanceSchedule | null,
  sources: readonly Source[],
  result: EngineResult,
): ScheduleVM {
  if (!schedule || result.status !== 'computed') {
    return {
      status: schedule ? displayState(schedule.verification.state) : 'pending',
      statusReason: reasonText(schedule),
      upcoming: [],
    };
  }
  const intervalOf = (id: string) => schedule.intervals.find((i) => i.id === id);
  const n = result.next;
  let next: NextServiceVM | undefined;
  if (n) {
    const lead = n.items[0];
    const iv = intervalOf(lead.intervalId);
    next = {
      title: serviceTitle(n.dueKm, lead.intervalLabel),
      intervalLabel: iv ? intervalLabel(iv) : lead.intervalLabel,
      dueAtKm: n.dueKm ?? undefined,
      dueDate: n.dueDate ?? undefined,
      remainingKm: n.remainingKm ?? undefined,
      remainingDays: n.remainingDays ?? undefined,
      forecastDate: n.forecastDate?.value,
      status: n.status,
      items: n.items.map((d) => toItemVM(d.item, schedule, sources)),
    };
  }
  // Later services: items outside the next visit, grouped by their due point.
  const inNext = new Set(n?.items.map((d) => d.item.id));
  const groups = new Map<string, ItemDue[]>();
  for (const d of result.items) {
    if (inNext.has(d.item.id) || (d.dueKm === null && d.dueDate === null)) continue;
    groups.set(dueKey(d), [...(groups.get(dueKey(d)) ?? []), d]);
  }
  const upcoming: UpcomingServiceVM[] = [...groups.values()]
    .map((g) => ({
      id: `up-${dueKey(g[0])}`,
      title: serviceTitle(g[0].dueKm, g[0].intervalLabel),
      dueAtKm: g[0].dueKm ?? undefined,
      dueDate: g[0].dueDate ?? undefined,
    }))
    .sort(
      (a, b) =>
        (a.dueAtKm ?? Infinity) - (b.dueAtKm ?? Infinity) ||
        (a.dueDate ?? '').localeCompare(b.dueDate ?? ''),
    );
  return {
    status: 'verified',
    source: toSourceRef(schedule, sources),
    next,
    upcoming,
  };
}

// ---------- history / documents / garage ----------

export function toServiceEventVM(e: ServiceEvent): ServiceEventVM {
  return {
    id: e.id,
    vehicleId: e.vehicleId,
    date: e.date,
    odometerKm: e.odometerKm,
    garage: e.garageName ?? undefined,
    notes: e.notes ?? undefined,
    origin: e.origin,
    verification: displayState(e.verification.state),
    sourceAuthority: e.authority,
    actions: e.actions.map((a) => ({
      id: a.id,
      title: a.title,
      actionType: a.actionType,
      performed: a.performed,
      maintenanceItemId: a.maintenanceItemId ?? undefined,
      unlisted: a.unlisted,
    })),
    documentIds: [...e.documentIds],
  };
}

const EXTRACTION_STATUS: Record<DerivedExtraction['status'], ExtractionStatus> = {
  // A draft awaits the user's review: some data is derived, none is confirmed.
  draft: 'partial',
  partial: 'partial',
  validated: 'validated',
  rejected: 'failed',
  failed: 'failed',
};

export function toDocumentVM(
  d: VehicleDocument,
  extractions: readonly DerivedExtraction[],
): DocumentVM {
  const latest = extractions.filter((x) => x.documentId === d.id).at(-1);
  return {
    id: d.id,
    vehicleId: d.vehicleId,
    kind: d.kind,
    title: d.title,
    addedAt: dateOf(d.createdAt),
    pages: d.original.pageCount,
    authority: d.authority,
    verification: d.verification ? displayState(d.verification.state) : 'pending',
    extraction: latest ? EXTRACTION_STATUS[latest.status] : 'none',
    mimeType: d.original.mimeType,
  };
}

export function toGarageRecommendationVM(g: GarageRecommendation): GarageRecommendationVM {
  return {
    id: g.id,
    vehicleId: g.vehicleId,
    text: g.text,
    date: g.date,
    garage: g.garageName ?? undefined,
    authority: g.authority,
  };
}

function itemTitle(schedule: MaintenanceSchedule | null, id: string | undefined): string {
  const item = schedule?.intervals.flatMap((i) => i.items).find((x) => x.id === id);
  return item?.title ?? he.data.unknownItem;
}

export function toDeferredVM(
  d: DeferredItem,
  schedule: MaintenanceSchedule | null,
): DeferredItemVM {
  return {
    id: d.id,
    vehicleId: d.vehicleId,
    title: itemTitle(schedule, d.maintenanceItemId),
    deferredAt: d.deferredAt,
    reason: d.reason ?? undefined,
  };
}

// ---------- alerts (explainable: why + basis + last completion) ----------

const num = (v: number | string | undefined) => (typeof v === 'number' ? v : undefined);
const str = (v: number | string | undefined) => (typeof v === 'string' ? v : undefined);

export function toAlertVM(
  alert: Alert,
  candidate: AlertCandidate,
  ctx: { schedule: MaintenanceSchedule | null; sources: readonly Source[] },
): AlertVM {
  const f = candidate.basis.facts;
  const odometer =
    num(f.odometerKm) !== undefined && str(f.odometerDate)
      ? he.data.basisOdometer(formatKm(num(f.odometerKm)!), formatDate(str(f.odometerDate)!))
      : undefined;
  const lastCompletion =
    str(f.lastDate) && num(f.lastKm) !== undefined
      ? he.data.lastService(formatDate(str(f.lastDate)!), formatKm(num(f.lastKm)!))
      : he.data.noRecordedCompletion;
  const base = {
    id: alert.id,
    vehicleId: alert.vehicleId,
    kind: alert.kind,
    createdAt: dateOf(alert.raisedAt),
    raisedAt: alert.raisedAt,
    maintenanceItemId: candidate.basis.maintenanceItemId,
    handled: alert.status === 'handled',
  };

  if (candidate.kind === 'upcoming' || candidate.kind === 'overdue') {
    const title = serviceTitle(num(f.dueKm) ?? null, str(f.label) ?? he.data.unknownItem);
    const km = num(f.remainingKm);
    const days = num(f.remainingDays);
    let reason: string;
    if (candidate.kind === 'upcoming') {
      reason =
        km !== undefined && days !== undefined
          ? he.data.remainingBoth(formatKm(Math.max(km, 0)), Math.max(days, 0))
          : km !== undefined
            ? he.data.remainingKm(formatKm(Math.max(km, 0)))
            : he.data.remainingDays(Math.max(days ?? 0, 0));
    } else {
      reason =
        str(f.dueBasis) === 'deferred'
          ? he.data.overdueDeferred
          : km !== undefined && km <= 0
            ? he.data.overdueKm(formatKm(Math.abs(km)))
            : days !== undefined && days <= 0
              ? he.data.overdueDays(Math.abs(days))
              : he.data.overdueDeferred;
    }
    const sourceTitle = ctx.schedule
      ? (toSourceRef(ctx.schedule, ctx.sources)?.sourceTitle ?? he.data.unknownSource)
      : he.data.unknownSource;
    return {
      ...base,
      title:
        candidate.kind === 'upcoming' ? he.data.alertUpcoming(title) : he.data.alertOverdue(title),
      reason,
      basis: [he.data.basisSchedule(sourceTitle), odometer].filter(Boolean).join(' · '),
      lastCompletion,
    };
  }
  if (candidate.kind === 'deferred') {
    return {
      ...base,
      title: he.data.deferredTitle(itemTitle(ctx.schedule, candidate.basis.maintenanceItemId)),
      reason: str(f.reason) ?? he.data.deferredReason,
      basis: he.data.deferredBasis(formatDate(str(f.deferredAt) ?? dateOf(alert.raisedAt))),
      lastCompletion: he.data.noRecordedCompletion,
    };
  }
  return {
    ...base,
    title: he.data.staleTitle,
    reason: he.data.staleReason(num(f.ageDays) ?? 0),
    basis: odometer ?? '',
  };
}

/** Matches persisted alerts to the candidates the current data justifies (by stable key). */
export function matchAlerts(
  alerts: readonly Alert[],
  candidates: readonly AlertCandidate[],
): { alert: Alert; candidate: AlertCandidate }[] {
  const byKey = new Map(alerts.map((a) => [a.basis.facts.key, a] as const));
  return candidates.flatMap((c) => {
    const alert = byKey.get(c.key);
    return alert ? [{ alert, candidate: c }] : [];
  });
}

// ---------- evidence-based maintenance plan (requirement engine) ----------

/**
 * Requirements for this vehicle: the known sources' claims plus the vehicle's own document claims
 * (converted by the deterministic trust rules — an unreviewed claim never verifies).
 */
export function vehicleRequirements(rec: VehicleRecords): MaintenanceRequirement[] {
  const docs = new Map((rec.knowledgeDocuments ?? []).map((d) => [d.id, d]));
  const own = (rec.claims ?? []).flatMap((c) => {
    const doc = docs.get(c.documentId);
    return doc ? [requirementFromClaim(c, doc)] : [];
  });
  // Only what the owner entered or accepted (owner decision 2026-10-04: AutoKeep never looks for a
  // schedule by itself).
  return [
    ...own,
    // Items from the owner's own documents: only those the owner accepted (owner review).
    ...(rec.msource?.owner?.requirements ?? []),
  ];
}

export function maintenancePlanVM(rec: VehicleRecords, today: IsoDate) {
  const v = rec.vehicle;
  const p = rec.maintenanceProfile ?? null;
  const plan = buildMaintenancePlan({
    vehicle: {
      id: v.id,
      kind: v.type,
      manufacturer: v.identity.manufacturer,
      model: v.identity.model,
      year: v.identity.year,
      engine: v.identity.engine,
      engineCode: v.identity.engineCode,
      fuel: v.identity.fuel,
    },
    profile: p
      ? { inServiceDate: p.inService?.date ?? null, serviceRegime: p.serviceRegime, usage: p.usage }
      : null,
    requirements: vehicleRequirements(rec),
    history: rec.history.map((e) => ({
      id: e.id,
      date: e.date,
      odometerKm: e.odometerKm,
      actions: e.actions.map((a) => ({
        performed: a.performed,
        maintenanceItemId: a.maintenanceItemId,
      })),
    })),
    readings: rec.readings.map((r) => ({ date: r.measuredAt, km: r.valueKm })),
    today,
    manual: (rec.manualItems ?? []).map((m) => ({
      id: m.id,
      custom: isCustom(m),
      requirement: manualRequirement(
        m,
        isCustom(m) ? m.title : m.title || he.maintenancePlan.tasks[m.task as TaskCode],
        today,
      ),
      lastDone: manualLastDone(m),
      startFrom: manualStartFrom(m),
    })),
  });
  return {
    ...toPlanVM(plan, (rec.knowledgeDocuments ?? []).length > 0, {
      proposals: rec.msource?.owner?.proposals ?? [],
      issues: rec.msource?.owner?.issues ?? [],
    }),
    manual: rec.manualItems ?? [],
  };
}

// ---------- the owner's maintenance table ----------

export function serviceTableVM(rec: VehicleRecords, today: IsoDate): ServiceTableVM | null {
  const t = rec.serviceTable;
  if (!t) return null;
  // What was done by the table counts while its history record exists (a deleted record no
  // longer completes the service).
  const events = new Set(rec.history.map((e) => e.id as string));
  const done = (rec.tableDone ?? []).filter(
    (d) => d.serviceEventId == null || events.has(d.serviceEventId),
  );
  const latest = latestReading(rec.readings);
  return {
    table: t.table,
    status: t.status,
    source: t.source,
    documentId: t.documentId,
    unsure: t.unsure,
    plan:
      t.status === 'confirmed'
        ? tablePlan({ table: t.table, odometerKm: latest?.valueKm ?? 0, today, done })
        : null,
  };
}

// ---------- the full bundle ----------

export function toBundle(
  rec: VehicleRecords,
  result: EngineResult,
  candidates: readonly AlertCandidate[],
  today: IsoDate,
): VehicleDataBundle {
  const ctx = { schedule: rec.schedule, sources: rec.sources };
  return {
    schedule: toScheduleVM(rec.schedule, rec.sources, result),
    history: rec.history.map(toServiceEventVM),
    documents: rec.documents.map((d) => toDocumentVM(d, rec.extractions)),
    alerts: matchAlerts(rec.alerts, candidates)
      // A snoozed alert stays out of view until its date.
      .filter(({ alert }) => !(alert.snoozedUntil && alert.snoozedUntil > today))
      .map(({ alert, candidate }) => toAlertVM(alert, candidate, ctx)),
    garageRecommendations: rec.garageRecommendations.map(toGarageRecommendationVM),
    deferred: rec.deferred.map((d) => toDeferredVM(d, rec.schedule)),
    plan: maintenancePlanVM(rec, today),
    serviceTable: serviceTableVM(rec, today),
    serviceTableOffer: !rec.serviceTable && isFiesta2012(rec.vehicle.identity),
    readings: rec.readings.map((r) => ({
      id: r.id,
      date: r.measuredAt,
      km: r.valueKm,
      source: r.source,
    })),
  };
}
