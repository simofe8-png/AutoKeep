import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  colors,
  elevation,
  Icon,
  radii,
  Screen,
  spacing,
  Stack,
  type IconName,
} from '@/ui';

const BENEFIT_ICONS: readonly IconName[] = [
  'clipboard-text-outline',
  'calendar-check-outline',
  'folder-outline',
];

/**
 * First-run welcome (owner request 2026-10-04: a fuller design). A blue hero with the vehicle mark,
 * name, title and tagline; three benefit cards; the actions fixed at the bottom — add the first
 * vehicle, or sign in on a new device.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const o = he.onboarding;
  return (
    <Screen
      testID="screen-onboarding-welcome"
      contentStyle={styles.content}
      footer={
        <Stack gap={spacing.sm}>
          <Button
            testID="onboarding-add-first"
            label={o.addFirstVehicle}
            icon="plus"
            fullWidth
            onPress={() => router.push('/onboarding/method')}
          />
          <Button
            testID="onboarding-sign-in"
            label={o.haveAccount}
            variant="tonal"
            fullWidth
            onPress={() => router.push({ pathname: '/account', params: { from: 'welcome' } })}
          />
        </Stack>
      }
    >
      <View style={styles.hero} testID="welcome-hero">
        <View style={[styles.ring, styles.ringLarge]} />
        <View style={[styles.ring, styles.ringSmall]} />
        <View style={styles.mark}>
          <Icon name="car-outline" size={44} color="primary" />
        </View>
        <AppText variant="title" color="textOnPrimary" align="center" accessibilityRole="header">
          {o.welcomeTitle}
        </AppText>
        <AppText color="textOnPrimary" align="center" style={styles.tagline}>
          {o.welcomeTagline}
        </AppText>
      </View>

      <Stack gap={spacing.md} testID="welcome-benefits">
        {o.benefits.map((b, i) => (
          <View key={b} style={styles.card}>
            <View style={styles.cardIcon}>
              <Icon name={BENEFIT_ICONS[i] ?? 'check'} size={26} color="primary" />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{b}</AppText>
              <AppText variant="small" color="textSecondary">
                {o.benefitDetails[i]}
              </AppText>
            </View>
          </View>
        ))}
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing.lg },
  hero: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.primary,
    overflow: 'hidden',
    ...elevation.raised,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  ringLarge: { width: 260, height: 260, top: -90, end: -80 },
  ringSmall: { width: 160, height: 160, bottom: -60, start: -50 },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
    ...elevation.raised,
  },
  tagline: { opacity: 0.9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
});
