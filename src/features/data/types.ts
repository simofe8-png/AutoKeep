/**
 * UI view-models consumed by screens. They are shaped for display, not persistence. The domain
 * model (M04) and real adapters (M13) map into these types so the approved UI does not change.
 */
import type { VerificationState } from '@/ui';

export type ActionType = 'inspection' | 'replacement' | 'other';

export type SourceAuthority =
  'manufacturer' | 'official_importer' | 'vehicle_document' | 'garage_document' | 'user_report';

export interface SourceRefVM {
  sourceTitle: string;
  authority: SourceAuthority;
  /** Exact location, e.g. "עמ׳ 412 · סעיף 6.3 · טבלה 6-1". */
  locator?: string;
  version?: string;
  documentId?: string;
}

export interface MaintenanceItemVM {
  id: string;
  title: string;
  actionType: ActionType;
  /** What the manufacturer states (quoted/paraphrased from the verified source). */
  manufacturerText: string;
  verification: VerificationState;
  source?: SourceRefVM;
}

export type DueStatus = 'ok' | 'upcoming' | 'overdue';

export interface NextServiceVM {
  title: string;
  intervalLabel: string;
  dueAtKm?: number;
  dueDate?: string;
  remainingKm?: number;
  remainingDays?: number;
  /** Forecast date from driving rate — always rendered as צפי. */
  forecastDate?: string;
  status: DueStatus;
  items: MaintenanceItemVM[];
}

export interface UpcomingServiceVM {
  id: string;
  title: string;
  dueAtKm?: number;
  dueDate?: string;
}

export interface ScheduleVM {
  /** verified → professional schedule available; otherwise it stays unavailable (no invention). */
  status: VerificationState;
  source?: SourceRefVM;
  /** Why the schedule is not verified (pending / unable to verify). */
  statusReason?: string;
  next?: NextServiceVM;
  upcoming: UpcomingServiceVM[];
}

export interface ServiceActionVM {
  id: string;
  title: string;
  actionType: ActionType;
  performed: boolean;
  maintenanceItemId?: string;
  /** Added by the user; not part of the manufacturer schedule. */
  unlisted: boolean;
  /** A manufacturer item consciously NOT performed now, to be done later (T129). */
  deferred?: boolean;
  /** A task of the evidence-based plan (links by its per-vehicle completion id). */
  fromPlan?: boolean;
}

export type ServiceOrigin = 'manual' | 'document';

export interface ServiceEventVM {
  id: string;
  vehicleId: string;
  date: string;
  odometerKm: number;
  garage?: string;
  notes?: string;
  origin: ServiceOrigin;
  /** Evidence quality for this record. */
  verification: VerificationState;
  sourceAuthority: SourceAuthority;
  actions: ServiceActionVM[];
  documentIds: string[];
  /** Manufacturer items deferred at this service (not performed; tracked until done). */
  deferredItemIds?: string[];
}

export type DocumentKind =
  'owners_manual' | 'maintenance_schedule' | 'invoice' | 'registration' | 'other';

export type ExtractionStatus = 'none' | 'processing' | 'validated' | 'partial' | 'failed';

export interface DocumentVM {
  id: string;
  vehicleId: string;
  kind: DocumentKind;
  title: string;
  addedAt: string;
  pages?: number;
  authority: SourceAuthority;
  verification: VerificationState;
  extraction: ExtractionStatus;
  /** Short note on derived data (kept separate from the original). */
  extractionNote?: string;
  /** Type of the stored original file (absent for prototype documents without a file). */
  mimeType?: string;
}

export type AlertKind = 'upcoming' | 'overdue' | 'deferred' | 'stale_odometer';

export interface AlertVM {
  id: string;
  vehicleId: string;
  kind: AlertKind;
  title: string;
  /** Why this alert exists. */
  reason: string;
  /** Data basis (source/odometer/interval). */
  basis: string;
  lastCompletion?: string;
  createdAt: string;
  /** Exact time the alert was raised (ISO timestamp), when known. */
  raisedAt?: string;
  maintenanceItemId?: string;
  handled: boolean;
}

export interface GarageRecommendationVM {
  id: string;
  vehicleId: string;
  text: string;
  date: string;
  garage?: string;
  /** Where the note came from: a garage document, or typed in by the user. */
  authority?: 'garage_document' | 'user_report';
}

export interface DeferredItemVM {
  id: string;
  vehicleId: string;
  title: string;
  deferredAt: string;
  reason?: string;
}

/** A recorded odometer reading and where it came from (dossier provenance). */
export interface OdometerReadingVM {
  id: string;
  date: string;
  km: number;
  source: 'user' | 'onboarding' | 'service_event' | 'document';
}

/** One maintenance task of the vehicle's evidence-based plan (requirement engine). */
export interface PlanItemVM {
  /** Unique per obligation: the task, or task-action for inspection/adjustment obligations. */
  key: string;
  task: string;
  /**
   * Evidence level (owner decision 2026-09-29): A = official source for the Israeli market;
   * B = the manufacturer's document for this model, Israeli-market applicability not verified;
   * T = triangulated from independent (possibly non-official) sources, with `confidence`.
   */
  level: 'A' | 'B' | 'T';
  /** Requirement confidence (separate from source authority). */
  confidence: 'high' | 'medium';
  /** Independent corroborating sources (T only). */
  corroboratingSources?: number;
  title: string;
  actionType: ActionType;
  actionLabel: string;
  intervalText: string;
  nextKm?: number;
  nextDate?: string;
  remainingKm?: number;
  remainingDays?: number;
  /** Driving-rate forecast date — always rendered as צפי. */
  forecastDate?: string;
  state: 'ok' | 'upcoming' | 'due' | 'overdue';
  /** Missing history is shown as such, never as a skipped service. */
  fromNew: boolean;
  lastDone?: { date: string; km: number };
  source: SourceRefVM;
  /** Links a recorded service action to this task on this vehicle. */
  completionId: string;
}

export type PlanRequestVM =
  | { kind: 'upload_booklet'; hint: 'seat_maintenance_programme' | 'ford_service_plan' | 'generic' }
  | {
      kind: 'service_regime';
      hint: 'seat_maintenance_programme' | 'ford_service_plan' | 'generic';
    }
  | { kind: 'usage' }
  | { kind: 'engine_code' }
  | { kind: 'in_service_date' }
  | { kind: 'odometer' }
  | { kind: 'awaiting_verification'; sources: { title: string; publishedOn?: string }[] }
  | {
      kind: 'official_source';
      sources: {
        sourceSystemId: string;
        host: string;
        url: string | null;
        reason:
          | 'manual_access_required'
          | 'access_policy_unresolved'
          | 'permission_required'
          | 'no_digital_source'
          | 'automatic';
        israeli: boolean;
        publishesSchedule: boolean;
      }[];
    }
  | { kind: 'no_official_source' }
  | { kind: 'official_source_pending' }
  | { kind: 'model_year_unproven' };

export interface MaintenancePlanVM {
  /** partial = useful but incomplete: always labelled as partial, never shown as complete. */
  status: 'ready' | 'partial' | 'needs_information';
  /** No reliable schedule: explicit fallback (message + private upload), reasons recorded. */
  fallback: { reasons: string[]; classKey: string } | null;
  items: PlanItemVM[];
  next: PlanItemVM[];
  requests: PlanRequestVM[];
  /** A maintenance booklet was uploaded for this vehicle (awaiting professional review). */
  bookletUploaded: boolean;
}

export interface VehicleDataBundle {
  /** Evidence-based plan from the requirement engine (absent in prototype bundles). */
  plan?: MaintenancePlanVM;
  schedule: ScheduleVM;
  history: ServiceEventVM[];
  documents: DocumentVM[];
  alerts: AlertVM[];
  garageRecommendations: GarageRecommendationVM[];
  deferred: DeferredItemVM[];
  /** All recorded odometer readings (real data; absent in prototype bundles). */
  readings?: OdometerReadingVM[];
}
