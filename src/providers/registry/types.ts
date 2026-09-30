import type { ExteriorPhase, RegistrationNumber } from '@/domain';
import type { VehicleVariant } from '@/identification/engine';

import type { VehicleRegistryRecord } from './vehicleRecord';

/**
 * Official vehicle registry port (ADR-0012). The implementation for Israel is data.gov.il.
 * Lookups send ONLY the registration number and require explicit user consent.
 */

/** A registry match: a vehicle variant plus facts only the registry provides. */
export interface RegistryVehicle extends VehicleVariant {
  vin?: string;
  fuel?: string;
  /** Engine displacement as published (e.g. "1598 סמ״ק"). */
  engine?: string;
  /** Engine code as published (`degem_manoa`, e.g. "CGG"); never derived from the displacement. */
  engineCode?: string;
  /** Body color as published (`tzeva_rechev`). */
  color?: string;
  /** Registry model code (`degem_nm`, e.g. "6J52E4"): identifies generation and body. */
  modelCode?: string;
  /** Exterior phase, only when a HIGH-confidence registry rule establishes it. */
  exteriorPhase?: ExteriorPhase;
  /** First registration on the road (`moed_aliya_lakvish`), month precision: "YYYY-MM". */
  firstRegistration?: string;
  /** Dataset the record came from (for provenance). */
  dataset: string;
  /** Every valid fact the Ministry datasets return for this plate (normalized; no statistics). */
  record?: VehicleRegistryRecord;
}

export type RegistryLookup =
  | { status: 'found'; candidates: RegistryVehicle[]; retrievedAt: string }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: 'network' | 'timeout' | 'bad_response' }
  | { status: 'consent_required' };

export interface VehicleRegistryProvider {
  readonly id: string;
  lookup(registration: RegistrationNumber, options: { consent: boolean }): Promise<RegistryLookup>;
}
