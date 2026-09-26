import type {
  ActionType,
  MaintenanceItemVM,
  ServiceActionVM,
  ServiceEventVM,
} from '@/features/data/types';
import type { AttachmentInput } from '@/features/data/DataContext';
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

export function unlistedAction(
  id: string,
  title: string,
  actionType: ActionType = 'other',
): ServiceActionVM {
  return { id, title, actionType, performed: true, unlisted: true };
}

export interface DraftErrors {
  date?: boolean;
  odometer?: boolean;
  actions?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string, today: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const real = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return real && value <= today;
}

/** Minimum manual data (spec §11): date, odometer, work performed. */
export function validateDraft(draft: ServiceDraft, today: string): DraftErrors {
  return {
    date: !isValidIsoDate(draft.date, today) || undefined,
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
    date: draft.date,
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
