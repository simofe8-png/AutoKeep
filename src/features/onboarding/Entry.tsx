import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehiclePhoto } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  BrandMark,
  Button,
  colors,
  Icon,
  IconCircle,
  InlineNotice,
  radii,
  Screen,
  spacing,
  Stack,
  Stepper,
  type IconName,
} from '@/ui';

/**
 * First-run welcome (approved reference "מסך פתיחה"): wordmark, promise, three benefits, add the
 * first vehicle — and the existing-user entry, so a Private Beta user on a new device signs in
 * without adding a vehicle first.
 */
export function WelcomeScreen() {
  const router = useRouter();
  return (
    <Screen
      testID="screen-onboarding-welcome"
      footer={
        <Stack gap={spacing.sm}>
          <Button
            testID="onboarding-add-first"
            label={he.onboarding.addFirstVehicle}
            icon="plus"
            fullWidth
            onPress={() => router.push('/onboarding/method')}
          />
          <Button
            testID="onboarding-sign-in"
            label={he.onboarding.haveAccount}
            variant="tonal"
            fullWidth
            onPress={() => router.push({ pathname: '/account', params: { from: 'welcome' } })}
          />
        </Stack>
      }
    >
      <View style={styles.welcomeTop}>
        <BrandMark size={28} />
        <AppText variant="title" align="center" accessibilityRole="header">
          {he.onboarding.welcomeTitle}
        </AppText>
        <AppText color="textSecondary" align="center">
          {he.onboarding.welcomeTagline}
        </AppText>
      </View>
      <VehiclePhoto vehicle={{ kind: 'car' }} variant="hero" />
      <Stack gap={spacing.sm} testID="welcome-benefits">
        {he.onboarding.benefits.map((b) => (
          <View key={b} style={styles.benefit}>
            <Icon name="check-circle" size={24} color="success" />
            <AppText style={styles.flex}>{b}</AppText>
          </View>
        ))}
      </Stack>
    </Screen>
  );
}

type Method = 'scan' | 'manual';

const methods: { value: Method; testID: string; icon: IconName; title: string; body: string }[] = [
  {
    value: 'scan',
    testID: 'onboarding-start-scan',
    icon: 'camera-outline',
    title: he.onboarding.startScan,
    body: he.onboarding.scanMethodBody,
  },
  {
    value: 'manual',
    testID: 'onboarding-manual',
    icon: 'keyboard-outline',
    title: he.onboarding.manualEntry,
    body: he.onboarding.manualMethodBody,
  },
];

/** "הוספת רכב חדש" (approved reference): stepper, identification method, continue. */
export function MethodScreen() {
  const router = useRouter();
  const { reset } = useOnboarding();
  const [method, setMethod] = useState<Method>('scan');
  return (
    <Screen
      testID="screen-onboarding-method"
      header={
        <ScreenHeader
          title={he.onboarding.addVehicleTitle}
          subtitle={he.onboarding.addVehicleSubtitle}
          closeIcon
        />
      }
      footer={
        <Button
          testID="onboarding-continue"
          label={he.common.continue}
          fullWidth
          onPress={() => {
            reset();
            router.push(method === 'scan' ? '/onboarding/scan' : '/onboarding/manual');
          }}
        />
      }
    >
      <Stepper steps={he.onboarding.stepNames} current={1} />
      <AppText variant="heading" accessibilityRole="header">
        {he.onboarding.chooseMethod}
      </AppText>
      <View accessibilityRole="radiogroup" style={styles.methods}>
        {methods.map((m) => {
          const selected = method === m.value;
          return (
            <Pressable
              key={m.value}
              testID={m.testID}
              onPress={() => setMethod(m.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${m.title}. ${m.body}`}
              android_ripple={{ color: colors.primarySoft }}
              style={[styles.method, selected && styles.methodSelected]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{m.title}</AppText>
                <AppText variant="small" color="textMuted">
                  {m.body}
                </AppText>
              </View>
              <IconCircle icon={m.icon} tone="info" size={56} />
            </Pressable>
          );
        })}
      </View>
      <InlineNotice tone="info" message={he.onboarding.methodInfo} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  welcomeTop: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  methods: { gap: spacing.md },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceTint },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#AEB7C6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
});
