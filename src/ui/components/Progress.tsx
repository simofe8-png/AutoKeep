import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';

import { colors, fontFamily, radii, spacing } from '../theme';
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

/** Numbered stepper with labels (reference "הוספת רכב חדש"). */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={he.onboarding.step(current, steps.length)}
    >
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <View key={label} style={styles.stepperItem}>
            <View style={styles.stepperDotRow}>
              <View style={[styles.stepperLine, i === 0 && styles.invisible]} />
              <View
                style={[
                  styles.dot,
                  (active || done) && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <AppText
                  variant="bodyStrong"
                  color={active || done ? 'textOnPrimary' : 'textSecondary'}
                  style={styles.dotText}
                >
                  {String(n)}
                </AppText>
              </View>
              <View style={[styles.stepperLine, i === steps.length - 1 && styles.invisible]} />
            </View>
            <AppText
              variant="caption"
              color={active ? 'textPrimary' : 'textMuted'}
              align="center"
              style={active ? styles.activeLabel : undefined}
            >
              {label}
            </AppText>
          </View>
        );
      })}
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
  stepper: { flexDirection: 'row' },
  stepperItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  stepperDotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepperLine: { flex: 1, height: 2, backgroundColor: colors.border },
  invisible: { opacity: 0 },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { lineHeight: 22 },
  activeLabel: { fontFamily: fontFamily.bold },
});
