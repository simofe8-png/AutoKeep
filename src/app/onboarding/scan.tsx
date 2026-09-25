import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { DemoScenarioPicker } from '@/features/shell/DemoScenarioPicker';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import type { ScanScenario } from '@/mocks/onboarding';
import { AppText, Button, colors, Icon, radii, Row, Screen, spacing } from '@/ui';

const scenarioOptions: { value: ScanScenario; label: string }[] = [
  { value: 'success', label: he.onboarding.scenarios.success },
  { value: 'partial', label: he.onboarding.scenarios.partial },
  { value: 'ambiguous', label: he.onboarding.scenarios.ambiguous },
  { value: 'failed', label: he.onboarding.scenarios.failed },
];

/** Registration/license scan (T013). Camera integration arrives in M06 (acquisition boundary). */
export default function OnboardingScan() {
  const router = useRouter();
  const { scanScenario, setScanScenario } = useOnboarding();
  const identify = () => router.push('/onboarding/identify');

  return (
    <Screen
      testID="screen-onboarding-scan"
      header={<ScreenHeader title={he.onboarding.scanTitle} />}
      footer={
        <>
          <Button
            testID="scan-capture"
            label={he.onboarding.capture}
            icon="camera"
            fullWidth
            onPress={identify}
          />
          <Row gap={spacing.sm}>
            <Button
              testID="scan-upload"
              label={he.onboarding.uploadImage}
              icon="image-outline"
              variant="secondary"
              style={styles.half}
              onPress={identify}
            />
            <Button
              testID="scan-manual"
              label={he.onboarding.manualEntry}
              icon="form-textbox"
              variant="secondary"
              style={styles.half}
              onPress={() => router.push('/onboarding/manual')}
            />
          </Row>
        </>
      }
    >
      <AppText variant="small" color="textMuted">
        {he.onboarding.step(1, 4)}
      </AppText>
      <View
        style={styles.viewfinder}
        accessible
        accessibilityLabel={he.onboarding.cameraPlaceholder}
      >
        <View style={styles.frame}>
          <Icon name="card-account-details-outline" size={56} color="textOnPrimary" />
        </View>
      </View>
      <AppText color="textSecondary">{he.onboarding.scanHint}</AppText>
      <DemoScenarioPicker
        testID="scan-scenario"
        options={scenarioOptions}
        value={scanScenario}
        onChange={setScanScenario}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: '#1B2A3E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  frame: {
    width: '100%',
    aspectRatio: 1.58,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  half: { flex: 1 },
});
