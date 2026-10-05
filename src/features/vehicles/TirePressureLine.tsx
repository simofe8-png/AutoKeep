import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, Icon, spacing } from '@/ui';

import type { VehicleSummary } from './types';

/**
 * Under the plate on Home (owner decision 2026-10-05): the tyre pressures the owner entered in
 * "מפרט הרכב", front and rear. Not entered: a tap-to-add line. Tapping opens the spec page.
 */
export function TirePressureLine({ vehicle }: { vehicle: VehicleSummary }) {
  const router = useRouter();
  const t = he.vehicleSpec;
  const front = vehicle.spec?.tirePressureFront ?? null;
  const rear = vehicle.spec?.tirePressureRear ?? null;
  const values = [
    front ? `${t.pressureFront} ${front}` : null,
    rear ? `${t.pressureRear} ${rear}` : null,
  ].filter(Boolean);
  const entered = values.length > 0;
  return (
    <Pressable
      testID="vehicle-tire-pressure"
      onPress={() => router.push(`/vehicle/${vehicle.id}/specification`)}
      accessibilityRole="button"
      accessibilityHint={t.pressureHint}
      hitSlop={6}
      style={styles.line}
    >
      <Icon name="tire" size={18} color={entered ? 'textSecondary' : 'primary'} />
      <AppText
        variant="small"
        color={entered ? 'textSecondary' : 'primary'}
        testID="vehicle-tire-pressure-text"
      >
        {`${t.pressureLabel}: ${entered ? values.join(' · ') : he.vehicleDates.notEntered}`}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    minHeight: 32,
  },
});
