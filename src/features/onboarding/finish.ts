import type { VehicleDetailsInput } from '@/features/data/DataContext';
import type { VehicleDataBundle } from '@/features/data/types';
import type { VehicleSummary } from '@/features/vehicles/types';

import type { VehicleDraft } from './types';

/** The confirmed onboarding draft as the vehicle to add (the odometer is measured today). */
export function vehicleFromDraft(
  id: string,
  draft: VehicleDraft,
  odometerKm: number,
  today: string,
): { vehicle: VehicleSummary; details: VehicleDetailsInput } {
  return {
    vehicle: {
      id,
      kind: draft.kind ?? 'car',
      manufacturer: draft.manufacturer ?? '',
      model: draft.model ?? '',
      year: draft.year ?? 0,
      registration: draft.registration ?? '',
      odometerKm,
      odometerMeasuredAt: today,
      archived: false,
      trim: draft.trim,
      engine: draft.engine,
      engineCode: draft.engineCode,
      fuel: draft.fuel,
      color: draft.color,
      modelCode: draft.modelCode,
    },
    details: {
      trim: draft.trim,
      engine: draft.engine,
      engineCode: draft.engineCode,
      fuel: draft.fuel,
      color: draft.color,
      vin: draft.vin,
      modelCode: draft.modelCode,
      firstRegistration: draft.firstRegistration,
      registryRecord: draft.registryRecord,
    },
  };
}

/** Demo mode only: the prototype bundle of a newly added vehicle (no schedule yet). */
export function demoBundle(
  vehicleId: string,
  fromScan: boolean,
  today: string,
  documentId: string,
): VehicleDataBundle {
  return {
    schedule: { status: 'unable_to_verify', upcoming: [] },
    history: [],
    documents: fromScan
      ? [
          {
            id: documentId,
            vehicleId,
            kind: 'registration',
            title: 'רישיון רכב',
            addedAt: today,
            pages: 1,
            authority: 'vehicle_document',
            verification: 'verified',
            extraction: 'validated',
          },
        ]
      : [],
    alerts: [],
    garageRecommendations: [],
    deferred: [],
  };
}
