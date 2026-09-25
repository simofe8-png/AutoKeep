import {
  issue,
  newMeta,
  validate,
  type DocumentId,
  type EntityMeta,
  type ExtractionId,
  type IdGenerator,
  type IsoDate,
  type MaintenanceItemId,
  type Result,
  type ServiceActionId,
  type ServiceEventId,
  type Timestamp,
  type VehicleId,
} from './core';
import { ACTION_TYPES, type ActionType } from './maintenance';
import { decideVerification, type SourceAuthority, type VerificationRecord } from './provenance';
import { MAX_ODOMETER_KM } from './vehicle';

/**
 * Service events & actions (T039).
 * Invariant 10: `performed` (checkbox) and `actionType` are independent fields.
 * Invariants 7/8: document-derived drafts never become history without explicit user confirmation.
 */

export interface ServiceAction {
  id: ServiceActionId;
  title: string;
  actionType: ActionType;
  performed: boolean;
  /** Link to the manufacturer item this action fulfils, if any. */
  maintenanceItemId: MaintenanceItemId | null;
  /** Added by the user; not part of the manufacturer schedule. */
  unlisted: boolean;
}

export type ServiceOrigin = 'manual' | 'document';

export interface ServiceEvent extends EntityMeta {
  id: ServiceEventId;
  vehicleId: VehicleId;
  date: IsoDate;
  odometerKm: number;
  garageName: string | null;
  notes: string | null;
  origin: ServiceOrigin;
  actions: ServiceAction[];
  documentIds: DocumentId[];
  /** Extraction the user reviewed before confirming (document origin only). */
  extractionId: ExtractionId | null;
  authority: SourceAuthority;
  verification: VerificationRecord;
  confirmedAt: Timestamp;
}

/** Editable draft (manual or document-derived). Not history. */
export interface ServiceDraft {
  vehicleId: VehicleId;
  origin: ServiceOrigin;
  date: string;
  odometerKm: number | null;
  garageName: string;
  notes: string;
  actions: Omit<ServiceAction, 'id'>[];
  documentIds: DocumentId[];
  extractionId: ExtractionId | null;
}

/**
 * Explicit user confirmation — the only path from a draft to a confirmed ServiceEvent.
 * Only performed actions are stored (checked = performed).
 */
export interface UserConfirmation {
  confirmedBy: 'user';
  confirmedAt: Timestamp;
}

export function confirmServiceDraft(
  draft: ServiceDraft,
  confirmation: UserConfirmation,
  ids: IdGenerator,
): Result<ServiceEvent> {
  const now = confirmation.confirmedAt;
  const performed = draft.actions.filter((a) => a.performed && a.title.trim() !== '');
  const today = now.slice(0, 10);
  const authority: SourceAuthority =
    draft.origin === 'document' && draft.documentIds.length > 0 ? 'garage_document' : 'user_report';
  return validate(
    [
      confirmation.confirmedBy !== 'user' &&
        issue('service.confirmation', 'User confirmation required'),
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) && issue('service.date', 'Invalid date', 'date'),
      draft.date > today && issue('service.future', 'Service date is in the future', 'date'),
      (draft.odometerKm === null ||
        !Number.isInteger(draft.odometerKm) ||
        draft.odometerKm < 0 ||
        draft.odometerKm > MAX_ODOMETER_KM) &&
        issue('service.odometer', 'Odometer is required', 'odometerKm'),
      performed.length === 0 &&
        issue('service.actions', 'At least one performed action is required', 'actions'),
      ...draft.actions.map(
        (a, i) =>
          !ACTION_TYPES.includes(a.actionType) &&
          issue('service.actionType', 'Invalid action type', `actions[${i}]`),
      ),
      draft.origin === 'document' &&
        draft.documentIds.length === 0 &&
        issue('service.document', 'Document origin requires the original document', 'documentIds'),
    ],
    () => ({
      id: ids.next<'ServiceEvent'>(),
      vehicleId: draft.vehicleId,
      date: draft.date as IsoDate,
      odometerKm: draft.odometerKm!,
      garageName: draft.garageName.trim() || null,
      notes: draft.notes.trim() || null,
      origin: draft.origin,
      actions: performed.map((a) => ({
        ...a,
        title: a.title.trim(),
        id: ids.next<'ServiceAction'>(),
      })),
      documentIds: [...draft.documentIds],
      extractionId: draft.extractionId,
      authority,
      // A garage document evidences the service; a manual entry stays a user report (unverified).
      verification: decideVerification(
        'service_performed',
        [{ authority, exactApplicability: true }],
        now,
      ),
      confirmedAt: now,
      ...newMeta(now),
    }),
  );
}

/** Chronological order, newest first (history is not the schedule — invariant 19). */
export function sortHistory(events: readonly ServiceEvent[]): ServiceEvent[] {
  return [...events].sort((a, b) =>
    a.date === b.date ? b.odometerKm - a.odometerKm : a.date < b.date ? 1 : -1,
  );
}
