import type { VehicleKind } from '@/features/vehicles/types';

export interface VehicleDraft {
  kind?: VehicleKind;
  manufacturer?: string;
  model?: string;
  year?: number;
  registration?: string;
  trim?: string;
  engine?: string;
  fuel?: string;
  vin?: string;
}

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
  return REQUIRED_FIELDS.filter((f) => {
    const v = draft[f];
    return v == null || (typeof v === 'string' && v.trim() === '');
  });
}

/** Where each field value came from, so the confirm screen can show provenance. */
/** registry = the official government vehicle registry (data.gov.il), fetched with consent. */
export type FieldOrigin = 'scan' | 'user' | 'registry';
