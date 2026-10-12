import type {
  ActionType,
  MaintenanceItemVM,
  PlanItemVM,
  ServiceActionVM,
  ServiceEventVM,
} from '@/features/data/types';
import type { AttachmentInput } from '@/features/data/DataContext';
import { parseUserDate } from '@/features/vehicles/expiry';
import { parseOdometer } from '@/features/vehicles/format';

export type DraftOrigin = 'manual' | 'document';

/** Editable draft of a service record. Nothing reaches history until explicitly confirmed. */
export interface ServiceDraft {
  vehicleId: string;
  origin: DraftOrigin;
  date: string;
  odometer: string;
  garage: string;
  notes: string;
  actions: ServiceActionVM[];
  /** Fields the extraction was not confident about (document drafts only). */
  uncertain: ('date' | 'odometer' | 'garage' | `action:${string}`)[];
  documentTitle?: string;
  /** The captured original (stored together with the record on confirmation). */
  attachment?: AttachmentInput;
  /** Why no values were read from the document (no provider / failed / flagged). */
  readingNote?: 'unavailable' | 'failed' | 'flagged';
  /** Opened from an alert: the maintenance item it is about (shown as context only). */
  fromAlertItem?: string;
}

export function actionsFromSchedule(
  items: MaintenanceItemVM[],
  preselectItemId?: string,
): ServiceActionVM[] {
  return items.map((item) => ({
    id: `draft-${item.id}`,
    title: item.title,
    actionType: item.actionType,
    performed: item.id === preselectItemId,
    maintenanceItemId: item.id,
    unlisted: false,
  }));
}

/**
 * Actions offered from the vehicle's evidence-based plan: every applicable task, NOT performed by
 * default — only what the user checks is recorded, and only a checked task receives the
 * completion (its per-vehicle completion id). Unrelated tasks are never marked done.
 */
export function actionsFromPlan(
  items: readonly PlanItemVM[],
  preselectTask?: string,
): ServiceActionVM[] {
  return items.map((item) => ({
    id: `draft-plan-${item.task}`,
    title: item.title,
    actionType: item.actionType,
    performed: item.task === preselectTask,
    maintenanceItemId: item.completionId,
    unlisted: false,
    fromPlan: true,
  }));
}

export function unlistedAction(
  id: string,
  title: string,
  actionType: ActionType = 'other',
): ServiceActionVM {
  return { id, title, actionType, performed: true, unlisted: true };
}

export interface DraftErrors {
  date?: boolean;
  /** The date is valid but in the future (only services already done are recorded). */
  dateFuture?: boolean;
  odometer?: boolean;
  actions?: boolean;
}

/**
 * The service date as YYYY-MM-DD, typed as 30.12.2025 (like every date field in the app) or as
 * 2025-12-30; null when it is not a real date. Any past date is accepted.
 */
export function draftDate(value: string): string | null {
  return parseUserDate(value) || null;
}

/** Minimum manual data (spec §11): date, odometer, work performed. */
export function validateDraft(draft: ServiceDraft, today: string): DraftErrors {
  const date = draftDate(draft.date);
  return {
    date: !date || date > today || undefined,
    dateFuture: (date != null && date > today) || undefined,
    odometer: parseOdometer(draft.odometer) == null || undefined,
    actions: !draft.actions.some((a) => a.performed && a.title.trim() !== '') || undefined,
  };
}

export function hasErrors(e: DraftErrors): boolean {
  return Boolean(e.date || e.odometer || e.actions);
}

/** Only called from the explicit confirmation action. Only performed actions are stored as done. */
export function draftToEvent(draft: ServiceDraft, id: string): ServiceEventVM {
  return {
    id,
    vehicleId: draft.vehicleId,
    date: draftDate(draft.date) ?? draft.date,
    odometerKm: parseOdometer(draft.odometer) ?? 0,
    garage: draft.garage.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    origin: draft.origin,
    // A user-confirmed record: document-backed records are garage evidence; manual ones remain
    // user reports and never silently become independently verified.
    verification: draft.origin === 'document' ? 'verified' : 'pending',
    sourceAuthority: draft.origin === 'document' ? 'garage_document' : 'user_report',
    actions: draft.actions.filter((a) => a.title.trim() !== '').filter((a) => a.performed),
    documentIds: draft.attachment ? [draft.attachment.documentId] : [],
    deferredItemIds: draft.actions
      .filter((a) => !a.performed && a.deferred && a.maintenanceItemId)
      .map((a) => a.maintenanceItemId!),
  };
}
