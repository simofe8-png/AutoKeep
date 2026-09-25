import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  DISPLAY_FIELDS,
  DraftFieldInput,
  FieldRow,
  formatDraftValue,
  toDraftValue,
} from '@/features/onboarding/fields';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { missingFields, type DraftField, type VehicleDraft } from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { AppText, Button, Card, Divider, InlineNotice, Screen, spacing, Stack } from '@/ui';

/** Vehicle confirmation + missing-data completion (T014): ask only for what is missing. */
export default function OnboardingConfirm() {
  const router = useRouter();
  const { draft, origins, setUserFields } = useOnboarding();
  const missing = missingFields(draft);
  const [inputs, setInputs] = useState<Partial<Record<DraftField, string>>>({});

  const completed: Partial<VehicleDraft> = Object.fromEntries(
    missing
      .map((f) => [f, toDraftValue(f, inputs[f] ?? '')] as const)
      .filter(([, v]) => v !== undefined),
  );
  const stillMissing = missingFields({ ...draft, ...completed });
  const known = DISPLAY_FIELDS.filter((f) => formatDraftValue(f, draft) !== undefined);

  return (
    <Screen
      testID="screen-onboarding-confirm"
      header={<ScreenHeader title={he.onboarding.confirmTitle} />}
      footer={
        <>
          <Button
            testID="confirm-details"
            label={he.onboarding.confirmDetails}
            fullWidth
            disabled={stillMissing.length > 0}
            onPress={() => {
              if (Object.keys(completed).length > 0) setUserFields(completed);
              router.push('/onboarding/odometer');
            }}
          />
          <Button
            testID="edit-details"
            label={he.onboarding.editDetails}
            variant="ghost"
            fullWidth
            onPress={() => router.push('/onboarding/manual')}
          />
        </>
      }
    >
      <AppText variant="small" color="textMuted">
        {he.onboarding.step(2, 4)}
      </AppText>
      <AppText color="textSecondary">{he.onboarding.confirmBody}</AppText>
      <Card>
        <Stack gap={spacing.xs}>
          {known.map((f, i) => (
            <Stack key={f} gap={spacing.xs}>
              {i > 0 ? <Divider /> : null}
              <FieldRow field={f} value={formatDraftValue(f, draft) ?? ''} origin={origins[f]} />
            </Stack>
          ))}
        </Stack>
      </Card>

      {missing.length > 0 ? (
        <Stack testID="missing-fields">
          <InlineNotice
            tone="warning"
            title={he.onboarding.missingTitle}
            message={he.onboarding.missingBody}
          />
          {missing.map((f) => (
            <DraftFieldInput
              key={f}
              field={f}
              value={inputs[f] ?? ''}
              required
              onChange={(v) => setInputs((s) => ({ ...s, [f]: v }))}
            />
          ))}
        </Stack>
      ) : null}
    </Screen>
  );
}
