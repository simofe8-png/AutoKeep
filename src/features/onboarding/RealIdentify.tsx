import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  applyVariant,
  type IdentificationDraft,
  type VehicleVariant,
} from '@/identification/engine';
import { emptyCatalog, identifyFromAcquisition } from '@/identification/pipeline';
import { AppText, Card, ErrorState, ListRow, LoadingState, Screen, Stack } from '@/ui';

import { useOnboarding } from './OnboardingContext';
import { toOnboardingDraft, type OnboardingServices } from './services';

type View =
  | { kind: 'running' }
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
  const { acquired, setIdentified } = useOnboarding();
  const [view, setView] = useState<View>({ kind: 'running' });

  useEffect(() => {
    let cancelled = false;
    const accept = (d: IdentificationDraft) => {
      const { draft, origins } = toOnboardingDraft(d);
      setIdentified(draft, origins);
      router.replace('/onboarding/confirm');
    };
    (async () => {
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
        <LoadingState message={he.onboarding.identifying} />
      </Screen>
    );
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
