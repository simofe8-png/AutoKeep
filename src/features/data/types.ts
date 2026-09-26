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

export interface VehicleDataBundle {
  schedule: ScheduleVM;
  history: ServiceEventVM[];
  documents: DocumentVM[];
  alerts: AlertVM[];
  garageRecommendations: GarageRecommendationVM[];
  deferred: DeferredItemVM[];
}
