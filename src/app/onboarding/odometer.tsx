import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { demoBundle, vehicleFromDraft } from '@/features/onboarding/finish';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { missingFields } from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatNumber, parseOdometer } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  colors,
  elevation,
  fontFamily,
  Icon,
  radii,
  Screen,
  spacing,
  Stack,
  StepProgress,
} from '@/ui';

/** Digits only, grouped while typing ("42300" → "42,300"). */
function formatKmInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 7);
  return digits ? formatNumber(Number(digits)) : '';
}

/**
 * The last onboarding step: the current odometer reading, then the vehicle is added. Centred and
 * clean like the plate search, the reading on a light background (owner's choice 2026-10-04).
 */
export default function OnboardingOdometer() {
  const router = useRouter();
  const { odometerKm, setOdometer, draft, origins } = useOnboarding();
  const { addVehicle, isDemoData, today } = useAppData();
  const { setActiveVehicleId } = useActiveVehicle();
  const [value, setValue] = useState(odometerKm != null ? formatKmInput(String(odometerKm)) : '');
  const [touched, setTouched] = useState(false);
  const km = parseOdometer(value);
  const o = he.onboarding;
  const error = touched && value !== '' && km == null ? o.odometerError : undefined;

  const finish = () => {
    if (km == null) return setTouched(true);
    setOdometer(km);
    // Never create a vehicle from an incomplete draft (e.g. a stale deep link).
    if (missingFields(draft).length > 0) return router.replace('/onboarding');
    // The last step: the vehicle is added (owner decision 2026-10-04: no automatic search for a
    // maintenance schedule — the owner enters it or uploads the booklet).
    const id = newLocalId('vehicle');
    const { vehicle, details } = vehicleFromDraft(id, draft, km, today());
    addVehicle(
      vehicle,
      isDemoData
        ? demoBundle(id, origins.registration === 'scan', today(), newLocalId('doc'))
        : undefined,
      details,
    );
    setActiveVehicleId(id);
    router.dismissTo('/');
    // Straight to "השלמת פרופיל הרכב" (owner decision 2026-10-05); Home is right behind it.
    router.push(`/vehicle/${id}/profile`);
  };

  return (
    <Screen
      testID="screen-onboarding-odometer"
      header={<ScreenHeader title={o.odometerTitle} />}
      contentStyle={styles.content}
    >
      <StepProgress step={3} total={3} />
      <View style={styles.fill}>
        <Stack gap={spacing.xxl}>
          <Stack gap={spacing.sm}>
            <AppText variant="title" align="center" accessibilityRole="header">
              {o.odometerLabel}
            </AppText>
            <AppText color="textSecondary" align="center">
              {o.odometerBody}
            </AppText>
          </Stack>
          <View style={[styles.field, error ? styles.fieldError : null]}>
            <View style={styles.iconBubble}>
              <Icon name="speedometer" size={26} color="primary" />
            </View>
            <TextInput
              testID="input-odometer"
              value={value}
              onChangeText={(v) => {
                setValue(formatKmInput(v));
                setTouched(true);
              }}
              keyboardType="number-pad"
              maxLength={9}
              placeholder="0"
              placeholderTextColor={colors.textDisabled}
              accessibilityLabel={o.odometerLabel}
              accessibilityHint={error ?? o.measuredToday}
              maxFontSizeMultiplier={1.2}
              style={styles.digits}
            />
            <AppText variant="bodyStrong" color="textSecondary">
              {he.common.km}
            </AppText>
          </View>
          {error ? (
            <AppText variant="small" color="danger" align="center" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <Stack gap={spacing.md}>
            <Button
              testID="odometer-continue"
              label={he.common.continue}
              fullWidth
              disabled={km == null}
              onPress={finish}
            />
            <View style={styles.measured}>
              <Icon name="calendar-today" size={16} color="textMuted" />
              <AppText variant="caption" color="textMuted">
                {o.measuredToday}
              </AppText>
            </View>
          </Stack>
        </Stack>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: spacing.xxxl },
  fill: { flex: 1, justifyContent: 'center' },
  field: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    height: 96,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    // Light blue of the progress bar's blue (owner's choice 2026-10-04), framed in that blue.
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: '#D6E6FF',
    ...elevation.card,
  },
  fieldError: { borderColor: colors.danger },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  digits: {
    minWidth: 150,
    textAlign: 'center',
    writingDirection: 'ltr',
    fontFamily: fontFamily.bold,
    fontSize: 44,
    letterSpacing: 2,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  measured: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
