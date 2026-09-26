import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, parseOdometer } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Button, Card, Screen, TextField } from '@/ui';

/** Odometer update for the active vehicle. Each vehicle keeps its own reading and date. */
export default function OdometerScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { updateOdometer, today } = useAppData();
  const [value, setValue] = useState('');

  if (!activeVehicle) return null;
  const km = parseOdometer(value);
  const lower = km != null && km < activeVehicle.odometerKm;
  const error =
    value === ''
      ? undefined
      : km == null
        ? he.onboarding.odometerError
        : lower
          ? he.odometer.lowerThanPrevious
          : undefined;

  return (
    <Screen
      testID="screen-odometer"
      header={<ScreenHeader title={he.odometer.title} />}
      footer={
        <Button
          testID="odometer-save"
          label={he.odometer.save}
          fullWidth
          disabled={km == null || lower}
          onPress={() => {
            if (km == null || lower) return;
            updateOdometer(activeVehicle.id, km, today());
            router.back();
          }}
        />
      }
    >
      <VehicleTargetBanner vehicle={activeVehicle} label={he.alerts.vehicle} />
      <Card tone="muted">
        <AppText variant="small" color="textMuted">
          {he.odometer.current}
        </AppText>
        <AppText variant="heading">{formatKm(activeVehicle.odometerKm)}</AppText>
        <AppText variant="caption" color="textMuted">
          {he.home.measuredAt}: {formatDate(activeVehicle.odometerMeasuredAt)}
        </AppText>
      </Card>
      <TextField
        testID="odometer-input"
        label={he.odometer.newReading}
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        suffix={he.common.km}
        required
        maxLength={9}
        error={error}
        hint={he.onboarding.measuredToday}
      />
    </Screen>
  );
}
