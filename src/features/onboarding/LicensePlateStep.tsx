import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRegistration, parseRegistration } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import {
  probeAgainstRegistry,
  type OcrTextProbe,
  type ProbeField,
} from '@/identification/ocrProbe';
import { LICENSE_OCR_POC_BUILD } from '@/providers/ocr/localLicenseOcr';
import type { OcrTextLine, PlateExtraction } from '@/identification/plateCandidates';
import { AppText, Button, Card, InlineNotice, Screen, spacing, Stack, TextField } from '@/ui';

import { useOnboarding } from './OnboardingContext';
import { RegistryLookup } from './RegistryLookup';
import type { OnboardingServices } from './services';
import type { DraftField, FieldOrigin, VehicleDraft } from './types';

/** POC measurements are shown only in a build made with EXPO_PUBLIC_OCR_POC=1 (never text). */
export const OCR_POC = LICENSE_OCR_POC_BUILD;

export interface OcrOutcome {
  extraction: PlateExtraction | { kind: 'failed' };
  metrics: {
    ms: number;
    rotation: number;
    meanConfidence: number;
    text: OcrTextProbe;
    digitPassLines: number;
    /** Sanitized structure only (digits → 9, letters → A/א); never values. */
    shapes: string[];
    /** The captured image was deleted from the app cache after OCR. */
    imageDeleted: boolean;
  } | null;
  /** POC only: the OCR lines, kept in memory until the registry comparison, then dropped. */
  pocLines: OcrTextLine[] | null;
}

/**
 * License scan → plate confirmation (POC). The OCR plate is only a candidate: the user confirms or
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
  const pocLines = useRef(outcome.pocLines);
  const [match, setMatch] = useState<Record<ProbeField, boolean | null> | null>(null);

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
    if (pocLines.current) {
      setMatch(probeAgainstRegistry(pocLines.current, draft));
      pocLines.current = null; // the recognized text is dropped after the comparison
    }
    setIdentified(
      { ...draft, registration: plate.trim() },
      { ...origins, registration: plateOrigin },
    );
    if (!OCR_POC) router.replace('/onboarding/confirm');
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
      {OCR_POC && outcome.metrics ? (
        <Card tone="muted" testID="ocr-poc-metrics">
          <AppText variant="smallStrong">{he.onboarding.ocrPocTitle}</AppText>
          <AppText variant="caption" testID="ocr-poc-ocr">
            {pocSummary(outcome, candidates.length)}
          </AppText>
          {match ? (
            <AppText variant="caption" testID="ocr-poc-match">
              {`match ${Object.entries(match)
                .map(([k, v]) => `${k}=${v === null ? '-' : v ? 'Y' : 'N'}`)
                .join(' ')} plateOrigin=${plateOrigin}`}
            </AppText>
          ) : null}
          {match ? (
            <Button
              testID="ocr-poc-continue"
              label={he.common.continue}
              size="sm"
              onPress={() => router.replace('/onboarding/confirm')}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function pocSummary(o: OcrOutcome, candidates: number): string {
  const m = o.metrics!;
  const t = m.text;
  return [
    `ms=${m.ms} rot=${m.rotation} mean=${m.meanConfidence}`,
    `lines=${t.lines} heb=${t.hebrewLines} latdig=${t.latinOrDigitLines} labels=${t.labelsFound}/${t.labelsTotal}`,
    `plate=${o.extraction.kind} candidates=${candidates} digitPass=${m.digitPassLines} imageDeleted=${m.imageDeleted ? 'Y' : 'N'}`,
    `shapes=${m.shapes.join(' ; ')}`,
  ].join(' | ');
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
