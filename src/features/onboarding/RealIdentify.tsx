import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  applyVariant,
  type IdentificationDraft,
  type VehicleVariant,
} from '@/identification/engine';
import { digitShapes, probeText } from '@/identification/ocrProbe';
import { emptyCatalog, identifyFromAcquisition } from '@/identification/pipeline';
import { extractPlateCandidates } from '@/identification/plateCandidates';
import { discardCapturedImage, type LicenseOcr } from '@/providers/ocr/localLicenseOcr';
import { AppText, Card, ErrorState, ListRow, LoadingState, Screen, Stack } from '@/ui';

import { LicensePlateStep, OCR_POC, type OcrOutcome } from './LicensePlateStep';
import { useOnboarding } from './OnboardingContext';
import { toOnboardingDraft, type OnboardingServices } from './services';

type View =
  | { kind: 'running' }
  | { kind: 'plate'; outcome: OcrOutcome }
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string }
  | { kind: 'choose'; draft: IdentificationDraft; candidates: VehicleVariant[] };

/**
 * Real identification (M13): acquired image → registration extractor → catalog → result.
 * Without an approved extractor (G1) the image cannot be read, and the user continues with the
 * registry lookup or manual entry — nothing is guessed.
 */
export function RealIdentify({ services }: { services: OnboardingServices }) {
  const router = useRouter();
  const { acquired, setIdentified, setAcquired } = useOnboarding();
  const [view, setView] = useState<View>({ kind: 'running' });
  const ocrDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const accept = (d: IdentificationDraft) => {
      const { draft, origins } = toOnboardingDraft(d);
      setIdentified(draft, origins);
      router.replace('/onboarding/confirm');
    };
    (async () => {
      if (ocrDone.current) return; // the plate step is showing; the image was already released
      if (!services.extractor && services.licenseOcr) {
        if (!acquired || acquired.status !== 'acquired') {
          return setView({ kind: 'failed', message: he.onboarding.scanFailedBody });
        }
        const outcome = await readPlateOnDevice(services.licenseOcr, acquired.file.uri);
        // The license image is no longer needed: delete it and forget it.
        const deleted = await discardCapturedImage(acquired.file.uri).catch(() => false);
        if (outcome.metrics) outcome.metrics.imageDeleted = deleted;
        if (cancelled) return;
        ocrDone.current = true;
        setView({ kind: 'plate', outcome });
        setAcquired(null);
        return;
      }
      if (!services.extractor) return setView({ kind: 'unavailable' });
      if (!acquired) return setView({ kind: 'failed', message: he.onboarding.scanFailedBody });
      const r = await identifyFromAcquisition(
        acquired,
        services.extractor,
        emptyCatalog,
        new Date().getFullYear(),
      );
      if (cancelled) return;
      if (r.kind === 'draft') return accept(r.draft);
      if (r.kind === 'needs_selection') {
        return setView({ kind: 'choose', draft: r.draft, candidates: r.candidates });
      }
      if (r.kind === 'acquisition') {
        const message =
          r.result.status === 'permission_denied'
            ? he.onboarding.permissionDenied
            : r.result.status === 'rejected'
              ? he.onboarding.fileRejected
              : he.onboarding.scanFailedBody;
        return setView({ kind: 'failed', message });
      }
      setView({ kind: 'failed', message: he.onboarding.scanFailedBody });
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per acquired image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquired, services]);

  const header = <ScreenHeader title={he.onboarding.scanTitle} />;
  const manual = {
    label: he.onboarding.manualEntry,
    icon: 'form-textbox' as const,
    onPress: () => router.replace('/onboarding/manual'),
  };

  if (view.kind === 'running') {
    return (
      <Screen header={header} testID="screen-onboarding-identify" scroll={false}>
        <LoadingState
          message={services.licenseOcr ? he.onboarding.ocrReading : he.onboarding.identifying}
        />
        {services.licenseOcr ? (
          <AppText variant="small" color="textSecondary" align="center">
            {he.onboarding.ocrLocalNote}
          </AppText>
        ) : null}
      </Screen>
    );
  }
  if (view.kind === 'plate') {
    return <LicensePlateStep services={services} outcome={view.outcome} />;
  }
  if (view.kind === 'unavailable' || view.kind === 'failed') {
    return (
      <Screen header={header} testID="screen-onboarding-identify">
        <ErrorState
          testID={view.kind === 'unavailable' ? 'identify-unavailable' : 'identify-failed'}
          title={
            view.kind === 'unavailable'
              ? he.onboarding.readingUnavailableTitle
              : he.onboarding.scanFailedTitle
          }
          message={
            view.kind === 'unavailable' ? he.onboarding.readingUnavailableBody : view.message
          }
          action={
            view.kind === 'unavailable'
              ? manual
              : { label: he.onboarding.retryScan, icon: 'camera', onPress: () => router.back() }
          }
          secondaryAction={view.kind === 'unavailable' ? undefined : manual}
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} testID="screen-onboarding-identify">
      <AppText variant="title" accessibilityRole="header">
        {he.onboarding.ambiguousTitle}
      </AppText>
      <AppText color="textSecondary">{he.onboarding.ambiguousBody}</AppText>
      <Stack>
        {view.candidates.map((c, i) => (
          <Card key={`${c.model}-${i}`} compact>
            <ListRow
              testID={`candidate-${i}`}
              icon={c.type ? vehicleKindIcon[c.type] : 'car'}
              title={`${c.manufacturer} ${c.model} ${c.year}`}
              subtitle={joinParts([c.trim, c.engine])}
              onPress={() => {
                const { draft, origins } = toOnboardingDraft(applyVariant(view.draft, c));
                setIdentified(draft, origins);
                router.replace('/onboarding/confirm');
              }}
            />
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}

/**
 * On-device OCR → plate candidates. The recognized lines stay in memory only; outside a POC build
 * they are dropped here, and only the extracted plate candidates leave this function.
 */
async function readPlateOnDevice(ocr: LicenseOcr, uri: string): Promise<OcrOutcome> {
  try {
    const r = await ocr.recognize(uri);
    return {
      extraction: extractPlateCandidates(r.lines, r.digitLines),
      metrics: {
        ms: r.ms,
        rotation: r.rotation,
        meanConfidence: r.meanConfidence,
        text: probeText(r.lines),
        digitPassLines: r.digitLines.length,
        shapes: OCR_POC ? digitShapes([...r.lines, ...r.digitLines]) : [],
        imageDeleted: false,
      },
      pocLines: OCR_POC ? r.lines : null,
    };
  } catch {
    // No error detail is kept: it could echo image content.
    return { extraction: { kind: 'failed' }, metrics: null, pocLines: null };
  }
}
