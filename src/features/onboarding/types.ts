import type { ExteriorPhase } from '@/domain';
import type { VehicleKind } from '@/features/vehicles/types';

export interface VehicleDraft {
  kind?: VehicleKind;
  manufacturer?: string;
  model?: string;
  year?: number;
  registration?: string;
  trim?: string;
  engine?: string;
  /** Manufacturer engine code (e.g. "CGGB"); optional, never derived from the displacement. */
  engineCode?: string;
  fuel?: string;
  color?: string;
  vin?: string;
  /** Registry model code (e.g. "6J52E4"); not shown in the form, kept with registry origin. */
  modelCode?: string;
  /** Exterior phase from a high-confidence registry rule only (never entered by hand here). */
  exteriorPhase?: ExteriorPhase;
}

/** Registry facts that are not form fields but must travel with the draft. */
export const HIDDEN_REGISTRY_FIELDS = ['modelCode', 'exteriorPhase'] as const;

export type DraftField = keyof VehicleDraft;

/** Fields required to identify the vehicle and to match an exact official source. */
export const REQUIRED_FIELDS: readonly DraftField[] = [
  'kind',
  'manufacturer',
  'model',
  'year',
  'registration',
  'engine',
];

/** Only the necessary fields that are still missing — the app never re-asks known data. */
export function missingFields(draft: VehicleDraft): DraftField[] {
  const empty = (f: DraftField) => {
    const v = draft[f];
    return v == null || (typeof v === 'string' && v.trim() === '');
  };
  // The engine is identified by its displacement or by its engine code (either is a fact).
  return REQUIRED_FIELDS.filter((f) => empty(f) && !(f === 'engine' && !empty('engineCode')));
}

/** Where each field value came from, so the confirm screen can show provenance. */
/** registry = the official government vehicle registry (data.gov.il), fetched with consent. */
export type FieldOrigin = 'scan' | 'user' | 'registry';
