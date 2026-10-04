import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  DISPLAY_FIELDS,
  DraftFieldInput,
  FieldRow,
  formatDraftValue,
  toDraftValue,
} from '@/features/onboarding/fields';
import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { RegistryLookup } from '@/features/onboarding/RegistryLookup';
import { missingFields, type DraftField, type VehicleDraft } from '@/features/onboarding/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Divider,
  InlineNotice,
  Screen,
  spacing,
  Stack,
  StepProgress,
  PlateBadge,
} from '@/ui';

/** Vehicle confirmation + missing-data completion (T014): ask only for what is missing. */
export default function OnboardingConfirm() {
  const router = useRouter();
  const { draft, origins, setUserFields, setFields } = useOnboarding();
  const { isDemoData, network } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  // ADR-0017: plate first → official registry → OCR only for what is still missing. Registry
  // values replace scanned ones but never what the user typed.
  const offerRegistry =
    services !== null && Boolean(draft.registration) && origins.manufacturer !== 'registry';
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
            label={he.onboarding.continueToConfirm}
            fullWidth
            disabled={stillMissing.length > 0}
            onPress={() => {
              if (Object.keys(completed).length > 0) setUserFields(completed);
              router.push('/onboarding/odometer');
            }}
          />
          <Button
            testID="edit-details"
            label={he.onboarding.notMyVehicle}
            variant="ghost"
            fullWidth
            onPress={() => router.push('/onboarding/manual')}
          />
        </>
      }
    >
      <StepProgress step={2} total={3} />
      {draft.manufacturer && draft.model ? (
        <View style={styles.identity} testID="confirm-identity">
          <AppText variant="title" align="center" accessibilityRole="header">
            {he.onboarding.identifiedTitle}
          </AppText>
          <AppText color="textSecondary" align="center">
            {he.onboarding.identifiedBody}
          </AppText>
          <AppText variant="title" align="center">
            {`${draft.manufacturer} ${draft.model}`}
          </AppText>
          <AppText color="textSecondary" align="center">
            {[draft.year, draft.engine, draft.fuel].filter(Boolean).join('  |  ')}
          </AppText>
          {draft.registration ? <PlateBadge number={String(draft.registration)} size="lg" /> : null}
        </View>
      ) : (
        <AppText color="textSecondary">{he.onboarding.confirmBody}</AppText>
      )}
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

      {offerRegistry && services ? (
        <RegistryLookup
          plate={String(draft.registration)}
          registry={services.registry}
          offline={network === 'offline'}
          onFilled={(filled) => {
            const notTyped = Object.fromEntries(
              Object.entries(filled).filter(([k]) => origins[k as DraftField] !== 'user'),
            ) as Partial<VehicleDraft>;
            setFields(notTyped, 'registry');
          }}
        />
      ) : null}

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

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: spacing.sm },
});
