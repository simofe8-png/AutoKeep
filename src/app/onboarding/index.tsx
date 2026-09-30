import { WelcomeScreen } from '@/features/onboarding/Entry';
import { VehicleSearchScreen } from '@/features/onboarding/VehicleSearch';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';

/**
 * Onboarding entry: the first-run welcome, or — when adding another vehicle — the vehicle search
 * by plate directly (the same flow is reused; there is no duplicate onboarding).
 */
export default function OnboardingIndex() {
  const { vehicles } = useActiveVehicle();
  return vehicles.length > 0 ? <VehicleSearchScreen /> : <WelcomeScreen />;
}
