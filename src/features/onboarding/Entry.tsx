import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, BrandMark, Button, Icon, Screen, spacing, Stack } from '@/ui';

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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  welcomeTop: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
