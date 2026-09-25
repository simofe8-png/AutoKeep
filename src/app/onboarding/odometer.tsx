import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { parseOdometer } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Button, Screen, TextField } from '@/ui';

export default function OnboardingOdometer() {
  const router = useRouter();
  const { odometerKm, setOdometer } = useOnboarding();
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
            router.push('/onboarding/sources');
          }}
        />
      }
    >
      <AppText variant="small" color="textMuted">
        {he.onboarding.step(3, 4)}
      </AppText>
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
