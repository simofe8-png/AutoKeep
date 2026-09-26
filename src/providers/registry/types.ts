import type { RegistrationNumber } from '@/domain';
import type { VehicleVariant } from '@/identification/engine';

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
  /** Dataset the record came from (for provenance). */
  dataset: string;
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
