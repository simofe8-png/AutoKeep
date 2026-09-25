import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { AppText, Button, colors, Icon, Screen, spacing, Stack } from '@/ui';

export default function OnboardingWelcome() {
  const router = useRouter();
  const { reset } = useOnboarding();
  const { vehicles } = useActiveVehicle();
  const isAdding = vehicles.length > 0;

  return (
    <Screen
      testID="screen-onboarding-welcome"
      header={isAdding ? <ScreenHeader title={he.onboarding.addVehicleTitle} closeIcon /> : null}
      footer={
        <Stack gap={spacing.sm}>
          <Button
            testID="onboarding-start-scan"
            label={he.onboarding.startScan}
            icon="card-account-details-outline"
            fullWidth
            onPress={() => {
              reset();
              router.push('/onboarding/scan');
            }}
          />
          <Button
            testID="onboarding-manual"
            label={he.onboarding.manualEntry}
            variant="secondary"
            fullWidth
            onPress={() => {
              reset();
              router.push('/onboarding/manual');
            }}
          />
        </Stack>
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="car-wrench" size={48} color="primary" />
        </View>
        <AppText variant="display" align="center" accessibilityRole="header">
          {isAdding ? he.onboarding.addVehicleTitle : he.onboarding.welcomeTitle}
        </AppText>
        <AppText color="textSecondary" align="center">
          {he.onboarding.welcomeBody}
        </AppText>
        {!isAdding ? (
          <AppText variant="smallStrong" color="primary" align="center">
            {he.onboarding.welcomeNoAccount}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
