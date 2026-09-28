import { he } from '@/i18n/he';

import { vehicleKindIcon } from './kindIcon';
import type { VehicleSummary } from './types';
import { VehicleContextCard } from './VehicleVisuals';

export { vehicleKindIcon };

/**
 * Shown on high-impact vehicle-scoped actions (service recording, delete, etc.) so the user sees
 * exactly which vehicle is targeted — model + registration (UX baseline "Multiple vehicles"),
 * in the vehicle card of the approved references. The active-vehicle switcher itself is the
 * selector card on Home (VehicleSelectorCard).
 */
export function VehicleTargetBanner({
  vehicle,
  label = he.activeVehicle.targetVehicle,
}: {
  vehicle: VehicleSummary;
  label?: string;
}) {
  return <VehicleContextCard vehicle={vehicle} label={label} testID="vehicle-target-banner" />;
}
