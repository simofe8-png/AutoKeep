import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { DemoScenarioPicker } from '@/features/shell/DemoScenarioPicker';
import { he } from '@/i18n/he';
import type { ScanScenario } from '@/mocks/onboarding';
import {
  AppText,
  Button,
  colors,
  Icon,
  IconButton,
  InlineNotice,
  radii,
  spacing,
  StepProgress,
} from '@/ui';

const scenarioOptions: { value: ScanScenario; label: string }[] = [
  { value: 'success', label: he.onboarding.scenarios.success },
  { value: 'partial', label: he.onboarding.scenarios.partial },
  { value: 'ambiguous', label: he.onboarding.scenarios.ambiguous },
  { value: 'failed', label: he.onboarding.scenarios.failed },
];

/**
 * Registration/license scan (T013). Outside demo mode the camera / photo picker run through the
 * acquisition boundary (M06); the acquired image is then identified on the next step.
 */
export default function OnboardingScan() {
  const router = useRouter();
  const { isDemoData } = useAppData();
  const { scanScenario, setScanScenario, setAcquired } = useOnboarding();
  const services = isDemoData ? null : onboardingServices();
  const [problem, setProblem] = useState<string | null>(null);
  const acquire = (from: 'camera' | 'library') => async () => {
    if (services) {
      const a = services.acquisition;
      setProblem(null);
      const result = from === 'camera' ? await a.captureWithCamera() : await a.pickImage();
      // Only an acquired image moves on; anything else is explained here, in context.
      if (result.status === 'cancelled') return;
      if (result.status !== 'acquired') {
        setProblem(
          result.status === 'permission_denied'
            ? he.onboarding.permissionDenied
            : result.status === 'rejected'
              ? he.onboarding.fileRejected
              : he.onboarding.scanFailedBody,
        );
        return;
      }
      setAcquired(result);
    }
    router.push('/onboarding/identify');
  };

  return (
    <SafeAreaView style={styles.dark} edges={['top', 'bottom']} testID="screen-onboarding-scan">
      <View style={styles.topBar}>
        <View style={styles.side} />
        <AppText variant="heading" color="textOnPrimary" align="center" style={styles.flex}>
          {he.onboarding.scanTitle}
        </AppText>
        <View style={[styles.side, styles.end]}>
          <IconButton
            testID="screen-header-back"
            icon="close"
            color="textOnPrimary"
            accessibilityLabel={he.common.close}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <StepProgressDark step={1} total={4} />
        <AppText color="textOnPrimary" align="center">
          {he.onboarding.scanHint}
        </AppText>
        <View
          style={styles.viewfinder}
          accessible
          accessibilityLabel={he.onboarding.cameraPlaceholder}
        >
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <Icon name="card-account-details-outline" size={64} color="textOnPrimary" />
        </View>
        {problem ? <InlineNotice testID="scan-problem" tone="warning" message={problem} /> : null}
        <DemoScenarioPicker
          testID="scan-scenario"
          options={scenarioOptions}
          value={scanScenario}
          onChange={setScanScenario}
        />
      </ScrollView>
      <View style={styles.controls}>
        <View style={styles.controlSide}>
          <IconButton
            testID="scan-upload"
            icon="image-outline"
            color="textOnPrimary"
            accessibilityLabel={he.onboarding.uploadImage}
            onPress={acquire('library')}
          />
        </View>
        <Pressable
          testID="scan-capture"
          onPress={acquire('camera')}
          accessibilityRole="button"
          accessibilityLabel={he.onboarding.capture}
          style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.controlSide} />
      </View>
      <Button
        testID="scan-manual"
        label={he.onboarding.orManual}
        variant="secondary"
        fullWidth
        onPress={() => router.push('/onboarding/manual')}
        style={styles.manual}
      />
    </SafeAreaView>
  );
}

function StepProgressDark({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.stepBox}>
      <StepProgress step={step} total={total} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dark: { flex: 1, backgroundColor: '#0B1220' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    minHeight: 60,
  },
  side: { width: 56 },
  end: { alignItems: 'flex-end' },
  content: { padding: spacing.lg, gap: spacing.lg },
  stepBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  viewfinder: {
    aspectRatio: 1.58,
    borderRadius: radii.lg,
    backgroundColor: '#1B2A3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#FFFFFF' },
  tl: { top: 12, start: 12, borderTopWidth: 4, borderStartWidth: 4, borderTopStartRadius: 10 },
  tr: { top: 12, end: 12, borderTopWidth: 4, borderEndWidth: 4, borderTopEndRadius: 10 },
  bl: {
    bottom: 12,
    start: 12,
    borderBottomWidth: 4,
    borderStartWidth: 4,
    borderBottomStartRadius: 10,
  },
  br: { bottom: 12, end: 12, borderBottomWidth: 4, borderEndWidth: 4, borderBottomEndRadius: 10 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  controlSide: { width: 56, alignItems: 'center' },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.8 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  manual: { marginHorizontal: spacing.lg, marginVertical: spacing.sm },
});
