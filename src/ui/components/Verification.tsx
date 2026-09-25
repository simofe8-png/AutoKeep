import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';

import { spacing } from '../theme';
import { AppText } from './AppText';
import { Badge, type BadgeTone } from './Badge';
import type { IconName } from './Icon';

/**
 * The single shared vocabulary for verification state (UX baseline "Verification-state
 * components"). Screens must not invent their own uncertainty language.
 *
 *   ✓ מאומת   ◷ חסר מידע / ממתין לאימות   ! לא ניתן לאמת
 */
export type VerificationState = 'verified' | 'pending' | 'unable_to_verify';

const config: Record<VerificationState, { label: string; tone: BadgeTone; icon: IconName }> = {
  verified: { label: he.verification.verified, tone: 'success', icon: 'check-circle' },
  pending: { label: he.verification.pending, tone: 'warning', icon: 'clock-outline' },
  unable_to_verify: {
    label: he.verification.unableToVerify,
    tone: 'danger',
    icon: 'alert-circle',
  },
};

export function verificationLabel(state: VerificationState): string {
  return config[state].label;
}

export function VerificationBadge({
  state,
  testID,
}: {
  state: VerificationState;
  testID?: string;
}) {
  const c = config[state];
  return (
    <Badge label={c.label} tone={c.tone} icon={c.icon} testID={testID ?? `verification-${state}`} />
  );
}

/**
 * A forecast value (derived from driving rate). Always explicitly labeled צפי (invariant 11).
 */
export function ForecastValue({ value, testID }: { value: string; testID?: string }) {
  return (
    <View
      testID={testID}
      style={styles.forecast}
      accessible
      accessibilityLabel={`${he.forecast.label}: ${value}`}
    >
      <Badge label={he.forecast.label} tone="info" icon="chart-timeline-variant" />
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  forecast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
