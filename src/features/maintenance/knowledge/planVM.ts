import type { MaintenancePlanVM, PlanItemVM, SourceAuthority } from '@/features/data/types';
import { formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';

import type { DiscoveryStatus } from '@/discovery/maintenance/msource/status';
import type { VehicleRegistryRecord } from '@/providers/registry/vehicleRecord';

import type { MaintenancePlan, PlanItem } from './plan';
import { distanceKm, type RequirementAuthority } from '@/domain';

const AUTHORITY: Record<RequirementAuthority, SourceAuthority> = {
  importer: 'official_importer',
  manufacturer: 'manufacturer',
  official_publication: 'manufacturer',
  vehicle_document: 'vehicle_document',
  user_report: 'user_report',
  // A published technical source (not the owner's report): device check 2026-10-04 showed
  // carwiki.de labelled as a user report.
  secondary: 'technical_source',
};

function intervalText(item: PlanItem): string {
  const iv = item.requirement.interval;
  const km = distanceKm(iv.every);
  const kmText =
    iv.every && iv.every.unit === 'mi'
      ? `${formatNumber(km ?? 0)} (${formatNumber(iv.every.value)} mi)`
      : km != null
        ? formatNumber(km)
        : null;
  const text = he.maintenancePlan.every(
    iv.rule === 'time_only' ? null : kmText,
    iv.rule === 'distance_only' ? null : (iv.everyMonths ?? null),
    iv.rule === 'whichever_first',
  );
  return iv.repeats ? text : `${he.maintenancePlan.once} · ${text}`;
}

function itemVM(item: PlanItem): PlanItemVM | null {
  if (item.due.status !== 'computed' || item.due.state === 'completed') return null;
  const d = item.due;
  const e = item.requirement.evidence[0];
  const action = item.requirement.action;
  return {
    key: action === 'inspection' || action === 'adjustment' ? `${item.task}-${action}` : item.task,
    task: item.task,
    level: item.level,
    confidence: item.confidence,
    corroboratingSources: item.requirement.corroboration?.independentSources,
    title: he.maintenancePlan.tasks[item.task],
    actionType: action === 'adjustment' ? 'other' : action,
    actionLabel: he.maintenancePlan.actions[action],
    intervalText: intervalText(item),
    nextKm: d.nextKm ?? undefined,
    nextDate: d.nextDate ?? undefined,
    remainingKm: d.remainingKm ?? undefined,
    remainingDays: d.remainingDays ?? undefined,
    forecastDate: d.kmForecast?.value,
    state: d.state === 'completed' ? 'ok' : d.state,
    fromNew: d.basis === 'from_new',
    lastDone: item.lastCompletion
      ? { date: item.lastCompletion.date, km: item.lastCompletion.odometerKm }
      : undefined,
    source: {
      sourceTitle: e?.documentTitle ?? '',
      // The owner corrected the value read from their own document: said so on every display.
      authority: item.requirement.extraction.ownerEdit
        ? 'vehicle_document_edited'
        : AUTHORITY[item.requirement.authority],
      locator: [e?.page != null ? `עמ׳ ${e.page}` : null, e?.section, e?.table, e?.locator]
        .filter(Boolean)
        .join(' · '),
      version: e?.edition,
      documentId: e?.documentId,
    },
    completionId: item.completionId,
  };
}

/** Registry facts that identify the vehicle for maintenance purposes, in display order. */
const IDENTITY_FACTS: readonly (readonly string[])[] = [
  ['manufacturer', 'manufacturerRegistered'],
  ['commercialName'],
  ['modelYear'],
  ['engineCode'],
  ['displacement'],
  ['fuel'],
];

/**
 * The vehicle's identity as the Ministry record states it — only facts present in the record,
 * nothing derived. Null without a registry record, or when it lacks make, model or year.
 */
export function verifiedIdentity(
  record: VehicleRegistryRecord | null | undefined,
): MaintenancePlanVM['verifiedIdentity'] {
  if (!record) return null;
  const facts = IDENTITY_FACTS.map((keys) =>
    keys.map((k) => record.facts.find((f) => f.key === k)).find(Boolean),
  ).filter((f): f is NonNullable<typeof f> => f != null);
  const has = (k: string) => facts.some((f) => f.key === k);
  return (has('manufacturer') || has('manufacturerRegistered')) &&
    has('commercialName') &&
    has('modelYear')
    ? facts
    : null;
}

/**
 * Discovery presentation: VERIFIED_IDENTITY_ONLY when the registry identified the vehicle but no
 * schedule could be matched to it (no source / insufficient evidence; not a technical failure).
 */
export function discoveryPresentation(
  discovery: DiscoveryStatus,
  identity: MaintenancePlanVM['verifiedIdentity'],
): DiscoveryStatus['state'] | 'VERIFIED_IDENTITY_ONLY' {
  const noSchedule =
    discovery.state === 'NO_SOURCE_FOUND' || discovery.state === 'INSUFFICIENT_EVIDENCE';
  return noSchedule && !discovery.error && identity?.length
    ? 'VERIFIED_IDENTITY_ONLY'
    : discovery.state;
}

export function toPlanVM(
  plan: MaintenancePlan,
  bookletUploaded: boolean,
  discovery: DiscoveryStatus | null = null,
  identity: MaintenancePlanVM['verifiedIdentity'] = null,
  ownerReview: NonNullable<MaintenancePlanVM['ownerReview']> = { proposals: [], issues: [] },
): MaintenancePlanVM {
  const items = plan.items.map(itemVM).filter((x): x is PlanItemVM => x !== null);
  const next = plan.next.map(itemVM).filter((x): x is PlanItemVM => x !== null);
  return {
    status: plan.status,
    fallback: plan.fallback,
    items,
    next,
    requests: plan.requests,
    bookletUploaded,
    discovery,
    verifiedIdentity: identity,
    ownerReview,
  };
}
