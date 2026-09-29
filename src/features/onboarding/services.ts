import type { ExteriorPhase } from '@/domain';
import type { RegistrationExtractor } from '@/identification/contract';
import type { OcrProvider, StructuredExtractor } from '@/intelligence/ports';
import type { IdentificationDraft } from '@/identification/engine';
import type { AcquisitionProvider } from '@/providers/acquisition/types';
import type { LicenseOcr } from '@/providers/ocr/localLicenseOcr';
import type { VehicleRegistryProvider } from '@/providers/registry/types';
import type { VehicleKind } from '@/features/vehicles/types';

import type { DraftField, FieldOrigin, VehicleDraft } from './types';

/**
 * Runtime services used by onboarding outside demo mode (provider-independent ports).
 * `extractor` is null until an OCR/AI provider is approved (G1): a captured registration photo
 * then cannot be read automatically, and the user continues with the registry or manual entry.
 */
export interface OnboardingServices {
  acquisition: AcquisitionProvider;
  extractor: RegistrationExtractor | null;
  registry: VehicleRegistryProvider;
  /**
   * On-device license OCR (POC): reads a registration-number CANDIDATE that the user confirms
   * before the registry is consulted. Null where the native module is absent (Expo Go, tests).
   */
  licenseOcr?: LicenseOcr | null;
  /** Invoice OCR + structured extraction (M11 ports); null until a provider is approved (G1). */
  invoiceReader: { ocr: OcrProvider; extractor: StructuredExtractor } | null;
}

const UI_FIELD: Record<string, DraftField | undefined> = {
  type: 'kind',
  manufacturer: 'manufacturer',
  model: 'model',
  year: 'year',
  registration: 'registration',
  trim: 'trim',
  engine: 'engine',
  engineCode: 'engineCode',
  fuel: 'fuel',
  color: 'color',
  modelCode: 'modelCode',
  exteriorPhase: 'exteriorPhase',
  firstRegistration: 'firstRegistration',
  vin: 'vin',
};

/** Maps an identification draft (engine vocabulary) to the onboarding form draft + origins. */
export function toOnboardingDraft(d: IdentificationDraft): {
  draft: VehicleDraft;
  origins: Partial<Record<DraftField, FieldOrigin>>;
} {
  const draft: VehicleDraft = {};
  const origins: Partial<Record<DraftField, FieldOrigin>> = {};
  for (const [k, v] of Object.entries(d)) {
    const f = UI_FIELD[k];
    // An uncertain reading is not accepted silently: the field stays missing and is asked for.
    if (!f || !v || v.uncertain) continue;
    if (f === 'year') {
      const n = Number(v.value);
      if (!Number.isInteger(n)) continue;
      draft.year = n;
    } else if (f === 'kind') {
      draft.kind = v.value as VehicleKind;
    } else if (f === 'firstRegistration') {
      // A registry fact only (month precision); never typed by hand here.
      if (v.origin !== 'registry') continue;
      draft.firstRegistration = v.value;
    } else if (f === 'exteriorPhase') {
      // Only a registry fact (high-confidence rule) may set the exterior phase at onboarding.
      if (v.origin !== 'registry') continue;
      draft.exteriorPhase = v.value as ExteriorPhase;
    } else {
      draft[f] = v.value;
    }
    origins[f] = v.origin === 'registry' ? 'registry' : v.origin === 'user' ? 'user' : 'scan';
  }
  return { draft, origins };
}
