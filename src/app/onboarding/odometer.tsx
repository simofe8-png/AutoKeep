import { useRouter } from 'expo-router';
import { useState } from 'react';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { demoBundle, vehicleFromDraft } from '@/features/onboarding/finish';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { missingFields } from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { parseOdometer } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Button, Screen, TextField, StepProgress } from '@/ui';

export default function OnboardingOdometer() {
  const router = useRouter();
  const { odometerKm, setOdometer, draft, origins } = useOnboarding();
  const { addVehicle, isDemoData, today } = useAppData();
  const { setActiveVehicleId } = useActiveVehicle();
  const [value, setValue] = useState(odometerKm != null ? String(odometerKm) : '');
  const [touched, setTouched] = useState(false);
  const km = parseOdometer(value);

  return (
    <Screen
      testID="screen-onboarding-odometer"
      header={<ScreenHeader title={he.onboarding.odometerTitle} />}
      footer={
        <Button
          testID="odometer-continue"
          label={he.common.continue}
          fullWidth
          disabled={km == null}
          onPress={() => {
            if (km == null) return setTouched(true);
            setOdometer(km);
            // Never create a vehicle from an incomplete draft (e.g. a stale deep link).
            if (missingFields(draft).length > 0) return router.replace('/onboarding');
            // The last step: the vehicle is added (owner decision 2026-10-04: no automatic search
            // for a maintenance schedule — the owner enters it or uploads the booklet).
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
          }}
        />
      }
    >
      <StepProgress step={3} total={3} />
      <AppText color="textSecondary">{he.onboarding.odometerBody}</AppText>
      <TextField
        testID="input-odometer"
        label={he.onboarding.odometerLabel}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setTouched(true);
        }}
        keyboardType="number-pad"
        suffix={he.common.km}
        required
        maxLength={7}
        error={touched && value !== '' && km == null ? he.onboarding.odometerError : undefined}
        hint={he.onboarding.measuredToday}
      />
    </Screen>
  );
}
