import { Stack } from 'expo-router';

import { ServiceDraftProvider } from '@/features/service/ServiceDraftContext';
import { colors } from '@/ui';

export default function ServiceLayout() {
  return (
    <ServiceDraftProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </ServiceDraftProvider>
  );
}
