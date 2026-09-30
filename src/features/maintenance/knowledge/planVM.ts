import type { MaintenancePlanVM, PlanItemVM, SourceAuthority } from '@/features/data/types';
import { formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';

import type { MaintenancePlan, PlanItem } from './plan';
import { distanceKm, type RequirementAuthority } from '@/domain';

const AUTHORITY: Record<RequirementAuthority, SourceAuthority> = {
  importer: 'official_importer',
  manufacturer: 'manufacturer',
  official_publication: 'manufacturer',
  vehicle_document: 'vehicle_document',
  user_report: 'user_report',
  secondary: 'user_report',
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
      authority: AUTHORITY[item.requirement.authority],
      locator: [e?.page != null ? `עמ׳ ${e.page}` : null, e?.section, e?.table, e?.locator]
        .filter(Boolean)
        .join(' · '),
      version: e?.edition,
      documentId: e?.documentId,
    },
    completionId: item.completionId,
  };
}

export function toPlanVM(plan: MaintenancePlan, bookletUploaded: boolean): MaintenancePlanVM {
  const items = plan.items.map(itemVM).filter((x): x is PlanItemVM => x !== null);
  const next = plan.next.map(itemVM).filter((x): x is PlanItemVM => x !== null);
  return {
    status: plan.status,
    fallback: plan.fallback,
    items,
    next,
    requests: plan.requests,
    bookletUploaded,
  };
}
