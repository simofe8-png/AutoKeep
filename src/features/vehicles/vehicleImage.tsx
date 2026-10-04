import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';

import type { VehicleSummary } from './types';

/**
 * Vehicle image (owner decision 2026-10-04): only the photo the user adds. There is no automatic
 * image of any kind — without the user's photo the image area is empty, with an "add photo" action.
 */
export type VehicleImageState = { kind: 'user'; uri: string } | { kind: 'empty' };

export interface VehicleImageActions {
  capture: () => Promise<void>;
  pick: () => Promise<void>;
  canAcquire: boolean;
}

type ImageSubject = Pick<VehicleSummary, 'kind'> & Partial<VehicleSummary>;

export function useVehicleImage(vehicle: ImageSubject): {
  state: VehicleImageState;
  actions: VehicleImageActions;
} {
  const { vehiclePhotos, setVehiclePhoto, isDemoData } = useAppData();
  const id = vehicle.id;
  const userUri = id ? vehiclePhotos[id] : undefined;

  const acquisition = isDemoData ? null : (onboardingServices()?.acquisition ?? null);
  const acquire = async (from: 'camera' | 'library') => {
    if (!acquisition || !id) return;
    const r =
      from === 'camera' ? await acquisition.captureWithCamera() : await acquisition.pickImage();
    if (r.status === 'acquired') setVehiclePhoto(id, r.file);
  };

  return {
    state: userUri ? { kind: 'user', uri: userUri } : { kind: 'empty' },
    actions: {
      capture: () => acquire('camera'),
      pick: () => acquire('library'),
      canAcquire: Boolean(acquisition && id),
    },
  };
}
