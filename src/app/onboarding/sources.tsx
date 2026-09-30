import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import type { DocumentVM, VehicleDataBundle } from '@/features/data/types';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { missingFields, type VehicleDraft } from '@/features/onboarding/types';
import { DemoScenarioPicker } from '@/features/shell/DemoScenarioPicker';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { todayIso } from '@/features/vehicles/format';
import type { VehicleSummary } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import type { SourcePlan } from '@/features/sources/sourceService';
import type { SourceScenario } from '@/mocks/onboarding';
import {
  AppText,
  Button,
  Card,
  colors,
  ErrorState,
  Icon,
  InlineNotice,
  Screen,
  spacing,
  Stack,
  VerificationBadge,
  type VerificationState,
  StepProgress,
} from '@/ui';

const STEPS = [
  'discovery',
  'authority',
  'applicability',
  'retrieval',
  'extraction',
  'validation',
] as const;
type Step = (typeof STEPS)[number];

export const SOURCE_STEP_MS = 450;

/** Index of the step at which each scenario stops (inclusive). */
const stopAt: Record<SourceScenario, number> = {
  verified: STEPS.length - 1,
  pending: STEPS.indexOf('applicability'),
  notFound: STEPS.indexOf('discovery'),
};

const scenarioOptions: { value: SourceScenario; label: string }[] = [
  { value: 'verified', label: he.onboarding.sourceScenarios.verified },
  { value: 'pending', label: he.onboarding.sourceScenarios.pending },
  { value: 'notFound', label: he.onboarding.sourceScenarios.notFound },
];

const scheduleState: Record<SourceScenario, VerificationState> = {
  verified: 'verified',
  pending: 'pending',
  notFound: 'unable_to_verify',
};

function buildBundle(vehicleId: string, scenario: SourceScenario, fromScan: boolean) {
  const today = todayIso();
  const docs: DocumentVM[] = [];
  if (fromScan) {
    docs.push({
      id: newLocalId('doc'),
      vehicleId,
      kind: 'registration',
      title: 'רישיון רכב',
      addedAt: today,
      pages: 1,
      authority: 'vehicle_document',
      verification: 'verified',
      extraction: 'validated',
    });
  }
  if (scenario !== 'notFound') {
    docs.push({
      id: newLocalId('doc'),
      vehicleId,
      kind: 'owners_manual',
      title: 'ספר בעלים — מסמך הדגמה',
      addedAt: today,
      authority: 'manufacturer',
      verification: scheduleState[scenario],
      extraction: scenario === 'verified' ? 'validated' : 'none',
    });
  }
  const bundle: VehicleDataBundle = {
    schedule: {
      status: scheduleState[scenario],
      statusReason:
        scenario === 'pending'
          ? he.onboarding.sourcePendingBody
          : scenario === 'notFound'
            ? he.onboarding.sourceNotFoundBody
            : undefined,
      source:
        scenario === 'verified'
          ? { sourceTitle: 'ספר בעלים — מסמך הדגמה', authority: 'manufacturer' }
          : undefined,
      upcoming: [],
    },
    history: [],
    documents: docs,
    alerts: [],
    garageRecommendations: [],
    deferred: [],
  };
  return bundle;
}

function toVehicle(
  id: string,
  draft: VehicleDraft,
  odometerKm: number,
  today: string,
): VehicleSummary {
  return {
    id,
    kind: draft.kind ?? 'car',
    manufacturer: draft.manufacturer ?? '',
    model: draft.model ?? '',
    year: draft.year ?? 0,
    registration: draft.registration ?? '',
    odometerKm,
    odometerMeasuredAt: today,
    archived: false,
    trim: draft.trim,
    engine: draft.engine,
    engineCode: draft.engineCode,
    fuel: draft.fuel,
    color: draft.color,
    modelCode: draft.modelCode,
    exteriorPhase: draft.exteriorPhase,
    exteriorPhaseSource: draft.exteriorPhase ? 'registry' : undefined,
  };
}

/** One progress screen that updates, then a result (UX baseline "Source discovery UX"). */
export default function OnboardingSources() {
  const router = useRouter();
  const { addVehicle, isDemoData, today } = useAppData();
  const {
    draft,
    origins,
    odometerKm,
    sourceScenario: demoScenario,
    setSourceScenario,
  } = useOnboarding();
  const { setActiveVehicleId } = useActiveVehicle();
  const { planOfficialSource } = useAppData();
  // The vehicle id exists before the vehicle, so a found source/schedule can reference it.
  const [vehicleId] = useState(() => newLocalId('vehicle'));
  // Real mode: the actual pipeline drives the steps (T170). Demo mode: scripted scenarios.
  const [plan, setPlan] = useState<SourcePlan | null>(null);
  const [reached, setReached] = useState(0);
  const realScenario: SourceScenario = !plan
    ? 'notFound'
    : plan.status === 'not_found'
      ? 'notFound'
      : plan.status === 'verified' && plan.schedule?.applicability.exact
        ? 'verified'
        : 'pending';
  const sourceScenario: SourceScenario = isDemoData ? demoScenario : realScenario;
  const [progress, setProgress] = useState(0);
  const last = isDemoData
    ? stopAt[sourceScenario]
    : realScenario === 'verified'
      ? STEPS.length - 1
      : reached;
  const finished = isDemoData ? progress > last : plan !== null;
  const shownProgress = isDemoData ? progress : finished ? last + 1 : reached;

  useEffect(() => {
    if (!isDemoData || finished) return;
    const t = setTimeout(() => setProgress((p) => p + 1), SOURCE_STEP_MS);
    return () => clearTimeout(t);
  }, [progress, finished, isDemoData]);

  useEffect(() => {
    if (isDemoData || !draft.kind || !draft.manufacturer || !draft.model || !draft.year) return;
    let cancelled = false;
    void planOfficialSource(
      vehicleId,
      {
        type: draft.kind,
        manufacturer: draft.manufacturer,
        model: draft.model,
        year: draft.year,
        engine: draft.engine,
        trim: draft.trim,
        market: 'IL',
      },
      (step) => {
        if (!cancelled) setReached((r) => Math.max(r, STEPS.indexOf(step)));
      },
    ).then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
    // Runs once for this onboarding draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never create a vehicle from an incomplete draft (e.g. a stale deep link into this step).
  if (missingFields(draft).length > 0 || odometerKm == null) {
    return (
      <Screen
        header={<ScreenHeader title={he.onboarding.sourcesTitle} />}
        testID="screen-onboarding-sources"
      >
        <ErrorState
          testID="sources-incomplete"
          title={he.onboarding.missingTitle}
          message={he.onboarding.missingBody}
          action={{ label: he.onboarding.startScan, onPress: () => router.replace('/onboarding') }}
        />
      </Screen>
    );
  }

  const finish = () => {
    const id = vehicleId;
    addVehicle(
      toVehicle(id, draft, odometerKm ?? 0, today()),
      // Prototype placeholders only in demo mode; the real store records nothing it cannot back.
      isDemoData ? buildBundle(id, sourceScenario, origins.registration === 'scan') : undefined,
      {
        trim: draft.trim,
        engine: draft.engine,
        engineCode: draft.engineCode,
        fuel: draft.fuel,
        color: draft.color,
        vin: draft.vin,
        modelCode: draft.modelCode,
        exteriorPhase: draft.exteriorPhase,
        firstRegistration: draft.firstRegistration,
        registryRecord: draft.registryRecord,
      },
      plan,
    );
    setActiveVehicleId(id);
    router.dismissTo('/');
  };

  const result = finished
    ? sourceScenario === 'verified'
      ? {
          tone: 'success' as const,
          title: he.onboarding.sourceFoundTitle,
          body: he.onboarding.sourceFoundBody,
        }
      : sourceScenario === 'pending'
        ? {
            tone: 'warning' as const,
            title: he.onboarding.sourcePendingTitle,
            body: he.onboarding.sourcePendingBody,
          }
        : {
            tone: 'neutral' as const,
            title: he.onboarding.sourceNotFoundTitle,
            body: he.onboarding.sourceNotFoundBody,
          }
    : null;

  return (
    <Screen
      testID="screen-onboarding-sources"
      header={<ScreenHeader title={he.onboarding.sourcesTitle} />}
      footer={
        <Button
          testID="sources-finish"
          label={he.onboarding.finish}
          fullWidth
          disabled={!finished}
          onPress={finish}
        />
      }
    >
      <StepProgress step={4} total={4} />
      <AppText color="textSecondary">{he.onboarding.sourcesBody}</AppText>
      <Card>
        <Stack gap={spacing.sm}>
          {STEPS.map((step, i) => (
            <StepRow
              key={step}
              step={step}
              state={
                i < shownProgress
                  ? i === last && sourceScenario !== 'verified'
                    ? 'stopped'
                    : 'done'
                  : i === shownProgress && !finished
                    ? 'active'
                    : 'pending'
              }
            />
          ))}
        </Stack>
      </Card>
      {result ? (
        <Stack testID={`sources-result-${sourceScenario}`}>
          <VerificationBadge state={scheduleState[sourceScenario]} />
          <InlineNotice tone={result.tone} title={result.title} message={result.body} />
        </Stack>
      ) : null}
      <DemoScenarioPicker
        testID="source-scenario"
        options={scenarioOptions}
        value={sourceScenario}
        onChange={(s) => {
          setSourceScenario(s);
          setProgress(0);
        }}
      />
    </Screen>
  );
}

function StepRow({
  step,
  state,
}: {
  step: Step;
  state: 'done' | 'active' | 'pending' | 'stopped';
}) {
  return (
    <View
      style={styles.step}
      accessible
      accessibilityLabel={he.onboarding.sourceSteps[step]}
      accessibilityState={{ busy: state === 'active' }}
    >
      <View style={styles.stepIcon}>
        {state === 'active' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : state === 'done' ? (
          <Icon name="check-circle" size={22} color="success" />
        ) : state === 'stopped' ? (
          <Icon name="alert-circle-outline" size={22} color="warning" />
        ) : (
          <Icon name="circle-outline" size={22} color="textDisabled" />
        )}
      </View>
      <AppText
        variant={state === 'active' ? 'bodyStrong' : 'body'}
        color={state === 'pending' ? 'textMuted' : 'textPrimary'}
        style={styles.stepText}
      >
        {he.onboarding.sourceSteps[step]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  stepIcon: { width: 24, alignItems: 'center' },
  stepText: { flex: 1 },
});
