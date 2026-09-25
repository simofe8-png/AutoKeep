/**
 * MOCK DATA — UI prototype only. Simulated registration-scan outcomes used to exercise the
 * onboarding UI states. Real extraction arrives in M06 behind provider-independent boundaries.
 */
import type { VehicleDraft } from '@/features/onboarding/types';

export type ScanScenario = 'success' | 'partial' | 'ambiguous' | 'failed';
export type SourceScenario = 'verified' | 'pending' | 'notFound';

export const MOCK_SCAN_SUCCESS: VehicleDraft = {
  kind: 'car',
  manufacturer: 'מאזדה',
  model: '3',
  year: 2020,
  registration: '45-678-90',
  trim: 'Comfort',
  engine: '2.0 בנזין',
  fuel: 'בנזין',
  vin: 'JM1BP0000L0000001',
};

/** Partial: the registration document did not state the engine (needed for exact matching). */
export const MOCK_SCAN_PARTIAL: VehicleDraft = {
  kind: 'motorcycle',
  manufacturer: 'קוואסאקי',
  model: 'Z650',
  year: 2023,
  registration: '321-65-987',
};

/** Ambiguous: several exact candidates remain — the user must choose. */
export const MOCK_SCAN_CANDIDATES: VehicleDraft[] = [
  {
    kind: 'scooter',
    manufacturer: 'סאן יאנג',
    model: 'Joymax Z',
    year: 2021,
    registration: '77-123-45',
    engine: '300 סמ״ק',
    trim: 'ABS',
  },
  {
    kind: 'scooter',
    manufacturer: 'סאן יאנג',
    model: 'Joymax Z+',
    year: 2021,
    registration: '77-123-45',
    engine: '300 סמ״ק',
    trim: 'ABS + TCS',
  },
];
