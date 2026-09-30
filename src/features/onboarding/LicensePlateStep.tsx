import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRegistration, parseRegistration } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import type { PlateExtraction } from '@/identification/plateCandidates';
import { AppText, Button, InlineNotice, Screen, spacing, Stack, TextField } from '@/ui';

import { useOnboarding } from './OnboardingContext';
import { RegistryLookup } from './RegistryLookup';
import type { OnboardingServices } from './services';
import type { DraftField, FieldOrigin, VehicleDraft } from './types';

export interface OcrOutcome {
  extraction: PlateExtraction | { kind: 'failed' };
}

/**
 * License scan → plate confirmation. The OCR plate is only a candidate: the user confirms or
 * corrects it, then explicitly requests the official registry lookup (consent). Registry facts
 * fill the vehicle; nothing else read by OCR is used.
 */
export function LicensePlateStep({
  services,
  outcome,
}: {
  services: OnboardingServices;
  outcome: OcrOutcome;
}) {
  const router = useRouter();
  const { network } = useAppData();
  const { setIdentified } = useOnboarding();
  const ex = outcome.extraction;
  const proposed = ex.kind === 'single' ? formatRegistration(ex.plate) : '';
  const [plate, setPlate] = useState(proposed);

  const candidates = ex.kind === 'single' || ex.kind === 'ambiguous' ? ex.candidates : [];
  const typed = parseRegistration(plate);
  /** The plate is "from the scan" only if the user kept an OCR candidate unchanged. */
  const plateOrigin: FieldOrigin =
    typed && candidates.some((c) => c.plate === typed) ? 'scan' : 'user';

  const message =
    ex.kind === 'single'
      ? he.onboarding.plateSingle
      : ex.kind === 'ambiguous'
        ? he.onboarding.plateAmbiguous
        : ex.kind === 'failed'
          ? he.onboarding.plateFailed
          : he.onboarding.plateNone;

  const onFilled = (draft: VehicleDraft, origins: Partial<Record<DraftField, FieldOrigin>>) => {
    setIdentified(
      { ...draft, registration: plate.trim() },
      { ...origins, registration: plateOrigin },
    );
    router.replace('/onboarding/confirm');
  };

  return (
    <Screen
      testID="screen-onboarding-plate"
      header={<ScreenHeader title={he.onboarding.plateTitle} />}
    >
      <InlineNotice
        testID="plate-status"
        tone={ex.kind === 'single' ? 'info' : 'warning'}
        message={message}
      />
      {candidates.length > 1 || (ex.kind === 'ambiguous' && candidates.length > 0) ? (
        <Stack gap={spacing.xs} testID="plate-candidates">
          <AppText variant="smallStrong">{he.onboarding.plateCandidates}</AppText>
          <View style={styles.chips}>
            {candidates.map((c, i) => (
              <Button
                key={c.plate}
                testID={`plate-candidate-${i}`}
                label={formatRegistration(c.plate)}
                variant="tonal"
                size="sm"
                onPress={() => setPlate(formatRegistration(c.plate))}
              />
            ))}
          </View>
        </Stack>
      ) : null}
      <TextField
        testID="plate-input"
        label={he.onboarding.plateInput}
        value={plate}
        onChangeText={setPlate}
        keyboardType="number-pad"
        maxLength={10}
        required
      />
      <AppText variant="small" color="textSecondary">
        {he.onboarding.plateNotAuthority}
      </AppText>
      <RegistryLookup
        plate={plate}
        registry={services.registry}
        offline={network === 'offline'}
        onFilled={onFilled}
      />
      <Button
        testID="plate-manual"
        label={he.onboarding.plateManual}
        variant="secondary"
        fullWidth
        onPress={() => {
          if (typed) setIdentified({ registration: plate.trim() }, { registration: plateOrigin });
          router.replace('/onboarding/manual');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
