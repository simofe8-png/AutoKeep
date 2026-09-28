import { MethodScreen, WelcomeScreen } from '@/features/onboarding/Entry';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';

/**
 * Onboarding entry: the first-run welcome, or — when adding another vehicle — the identification
 * method directly (the same flow is reused; there is no duplicate onboarding).
 */
export default function OnboardingIndex() {
  const { vehicles } = useActiveVehicle();
  return vehicles.length > 0 ? <MethodScreen /> : <WelcomeScreen />;
}
