import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';

import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';

/** Horizontal progress (fills from the reading start). `value` is clamped to 0..1. */
export function ProgressBar({
  value,
  tone = 'primary',
  testID,
  accessibilityLabel,
}: {
  value: number;
  tone?: 'primary' | 'success' | 'danger' | 'warning';
  testID?: string;
  accessibilityLabel?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = {
    primary: colors.primary,
    success: colors.successStrong,
    danger: colors.dangerStrong,
    warning: '#E39A00',
  }[tone];
  return (
    <View
      testID={testID}
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
    >
      <View style={[styles.fill, { width: `${v * 100}%`, backgroundColor: fill }]} />
    </View>
  );
}

/** "שלב X מתוך N" with a progress bar (reference onboarding flow). */
export function StepProgress({ step, total }: { step: number; total: number }) {
  const label = he.onboarding.step(step, total);
  return (
    <View style={styles.step} testID="step-progress">
      <AppText variant="small" color="textSecondary" align="center">
        {label}
      </AppText>
      <ProgressBar value={step / total} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.neutralSoft,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: { height: '100%', borderRadius: radii.pill },
  step: { gap: spacing.xs },
});
