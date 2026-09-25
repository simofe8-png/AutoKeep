import { Stack } from 'expo-router';

import { OnboardingProvider } from '@/features/onboarding/OnboardingContext';
import { colors } from '@/ui';

/** Onboarding flow — used for the first vehicle and reused by "add vehicle" (no duplicate flow). */
export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </OnboardingProvider>
  );
}
