import { useRouter } from 'expo-router';
import { useState } from 'react';

import { DISPLAY_FIELDS, DraftFieldInput, toDraftValue } from '@/features/onboarding/fields';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import {
  missingFields,
  REQUIRED_FIELDS,
  type DraftField,
  type VehicleDraft,
} from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { Button, Screen, Stack } from '@/ui';

/** Manual fallback (always available). Prefills anything already known. */
export default function OnboardingManual() {
  const router = useRouter();
  const { draft, setUserFields } = useOnboarding();
  const [inputs, setInputs] = useState<Partial<Record<DraftField, string>>>(() =>
    Object.fromEntries(
      DISPLAY_FIELDS.filter((f) => draft[f] != null).map((f) => [f, String(draft[f])]),
    ),
  );

  const parsed: VehicleDraft = Object.fromEntries(
    DISPLAY_FIELDS.map((f) => [f, toDraftValue(f, inputs[f] ?? '')]).filter(
      ([, v]) => v !== undefined,
    ),
  );
  const incomplete = missingFields(parsed).length > 0;

  return (
    <Screen
      testID="screen-onboarding-manual"
      header={<ScreenHeader title={he.onboarding.manualEntry} />}
      footer={
        <Button
          testID="manual-continue"
          label={he.common.continue}
          fullWidth
          disabled={incomplete}
          onPress={() => {
            // Only fields the user changed are marked as user-entered.
            const changed = Object.fromEntries(
              Object.entries(parsed).filter(([k, v]) => draft[k as DraftField] !== v),
            ) as Partial<VehicleDraft>;
            setUserFields(changed);
            router.replace('/onboarding/confirm');
          }}
        />
      }
    >
      <Stack>
        {DISPLAY_FIELDS.map((f) => (
          <DraftFieldInput
            key={f}
            field={f}
            value={inputs[f] ?? ''}
            required={REQUIRED_FIELDS.includes(f)}
            onChange={(v) => setInputs((s) => ({ ...s, [f]: v }))}
          />
        ))}
      </Stack>
    </Screen>
  );
}
