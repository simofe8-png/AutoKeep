import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { RealIdentify } from '@/features/onboarding/RealIdentify';
import type { VehicleDraft } from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { MOCK_SCAN_CANDIDATES, MOCK_SCAN_PARTIAL, MOCK_SCAN_SUCCESS } from '@/mocks/onboarding';
import { AppText, Card, ErrorState, ListRow, LoadingState, Screen, Stack } from '@/ui';

/** Simulated processing time so the in-progress state is visible in the prototype. */
export const IDENTIFY_DELAY_MS = 900;

function candidateSubtitle(c: VehicleDraft) {
  return joinParts([c.trim, c.engine, c.registration]);
}

/** Identification result (T013/T014): success → confirm; ambiguity → user chooses; failure in context. */
export default function OnboardingIdentify() {
  const { isDemoData } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  return services ? <RealIdentify services={services} /> : <DemoIdentify />;
}

/** Demo mode: scripted scan outcomes (labeled prototype data). */
function DemoIdentify() {
  const router = useRouter();
  const { scanScenario, setIdentified } = useOnboarding();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), IDENTIFY_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!done) return;
    if (scanScenario === 'success' || scanScenario === 'partial') {
      setIdentified(scanScenario === 'success' ? MOCK_SCAN_SUCCESS : MOCK_SCAN_PARTIAL);
      router.replace('/onboarding/confirm');
    }
    // setIdentified identity changes with state; run once per completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, scanScenario]);

  const header = <ScreenHeader title={he.onboarding.scanTitle} />;

  if (!done || scanScenario === 'success' || scanScenario === 'partial') {
    return (
      <Screen header={header} testID="screen-onboarding-identify" scroll={false}>
        <LoadingState message={he.onboarding.identifying} />
      </Screen>
    );
  }

  if (scanScenario === 'failed') {
    return (
      <Screen header={header} testID="screen-onboarding-identify">
        <ErrorState
          testID="identify-failed"
          title={he.onboarding.scanFailedTitle}
          message={he.onboarding.scanFailedBody}
          action={{ label: he.onboarding.retryScan, icon: 'camera', onPress: () => router.back() }}
          secondaryAction={{
            label: he.onboarding.manualEntry,
            icon: 'form-textbox',
            onPress: () => router.replace('/onboarding/manual'),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} testID="screen-onboarding-identify">
      <AppText variant="title" accessibilityRole="header">
        {he.onboarding.ambiguousTitle}
      </AppText>
      <AppText color="textSecondary">{he.onboarding.ambiguousBody}</AppText>
      <Stack>
        {MOCK_SCAN_CANDIDATES.map((c, i) => (
          <Card key={`${c.model}-${i}`} compact>
            <ListRow
              testID={`candidate-${i}`}
              icon={c.kind ? vehicleKindIcon[c.kind] : 'car'}
              title={`${c.manufacturer} ${c.model} ${c.year}`}
              subtitle={candidateSubtitle(c)}
              onPress={() => {
                setIdentified(c);
                router.replace('/onboarding/confirm');
              }}
            />
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
