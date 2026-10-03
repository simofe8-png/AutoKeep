import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { parseRegistration } from '@/domain';
import { onboardingServices } from '@/features/data/dataSource';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { applyRegistry } from '@/identification/registry';
import { DEMO_REGISTRY } from '@/mocks/registry';
import type { RegistryVehicle, VehicleRegistryProvider } from '@/providers/registry/types';
import { RegistryFacts } from '@/features/vehicles/RegistryFacts';
import {
  AppText,
  Button,
  Card,
  InlineNotice,
  ListRow,
  PlateBadge,
  Screen,
  spacing,
  Stack,
  TextField,
} from '@/ui';

import { useOnboarding } from './OnboardingContext';
import { formatPlateInput } from './plateInput';
import { toOnboardingDraft } from './services';
import { missingFields, type DraftField, type FieldOrigin, type VehicleDraft } from './types';

/** Real mode: the Ministry registry service; labelled demo: the mock registry. */
function useRegistry(): VehicleRegistryProvider {
  return onboardingServices()?.registry ?? DEMO_REGISTRY;
}

/** Ministry record → onboarding draft. The typed plate stays user-entered; the rest is registry. */
export function draftFromRegistry(
  plate: string,
  v: RegistryVehicle,
): { draft: VehicleDraft; origins: Partial<Record<DraftField, FieldOrigin>> } {
  const { draft, origins } = toOnboardingDraft(
    applyRegistry(
      { registration: { value: plate, origin: 'user', confidence: null, uncertain: false } },
      v,
    ),
  );
  return {
    draft: { ...draft, registration: plate, ...(v.record ? { registryRecord: v.record } : {}) },
    origins: { ...origins, registration: 'user' },
  };
}

type Problem = { kind: 'invalid' | 'not_found' | 'unavailable' } | null;

/**
 * Add Vehicle = "חיפוש רכב": one plate field (hyphens added while typing) and one button. The
 * plate goes to the Ministry of Transport public vehicle data; nothing else is asked here.
 */
export function VehicleSearchScreen() {
  const router = useRouter();
  const registry = useRegistry();
  const { reset, setIdentified, setCandidates } = useOnboarding();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const find = async () => {
    const plate = parseRegistration(value);
    if (!plate) return setProblem({ kind: 'invalid' });
    setProblem(null);
    setBusy(true);
    // Pressing the button is the user's explicit request: only the plate number is sent.
    const r = await registry.lookup(plate, { consent: true });
    setBusy(false);
    if (r.status === 'not_found') return setProblem({ kind: 'not_found' });
    if (r.status !== 'found') return setProblem({ kind: 'unavailable' });
    reset();
    if (r.candidates.length === 1) {
      const { draft, origins } = draftFromRegistry(value.trim(), r.candidates[0]);
      setIdentified(draft, origins);
    } else {
      setIdentified({ registration: value.trim() }, { registration: 'user' });
      setCandidates(r.candidates);
    }
    router.push('/onboarding/vehicle');
  };

  const message =
    problem?.kind === 'invalid'
      ? he.vehicleSearch.invalid
      : problem?.kind === 'not_found'
        ? he.vehicleSearch.notFound
        : undefined;

  return (
    <Screen
      testID="screen-vehicle-search"
      header={<ScreenHeader title={he.vehicleSearch.title} closeIcon />}
    >
      <TextField
        testID="vehicle-search-plate"
        label={he.vehicleSearch.plateLabel}
        value={value}
        onChangeText={(t) => {
          setValue(formatPlateInput(t));
          setProblem(null);
        }}
        keyboardType="number-pad"
        maxLength={10}
        required
        error={message}
      />
      {problem?.kind === 'unavailable' ? (
        <InlineNotice
          testID="vehicle-search-unavailable"
          tone="warning"
          message={he.vehicleSearch.unavailable}
          action={{ label: he.vehicleSearch.retry, icon: 'refresh', onPress: () => void find() }}
        />
      ) : null}
      <Button
        testID="vehicle-search-find"
        label={he.vehicleSearch.find}
        fullWidth
        loading={busy}
        disabled={busy}
        onPress={() => void find()}
      />
    </Screen>
  );
}

/** The Ministry details of the plate; the user confirms and adds the vehicle. */
export function VehicleDetailsStep() {
  const router = useRouter();
  const { draft, candidates, setIdentified, setCandidates } = useOnboarding();
  const plate = draft.registration ?? '';
  const choosing = candidates.length > 1 && !draft.manufacturer;

  return (
    <Screen
      testID="screen-vehicle-details"
      header={<ScreenHeader title={he.vehicleSearch.detailsTitle} />}
      footer={
        choosing ? undefined : (
          <>
            <Button
              testID="vehicle-details-add"
              label={he.vehicleSearch.add}
              fullWidth
              onPress={() =>
                router.push(
                  missingFields(draft).length > 0 ? '/onboarding/confirm' : '/onboarding/odometer',
                )
              }
            />
            <Button
              testID="vehicle-details-search-again"
              label={he.vehicleSearch.searchAgain}
              variant="ghost"
              fullWidth
              onPress={() => router.back()}
            />
          </>
        )
      }
    >
      {plate ? (
        <View style={styles.center}>
          <PlateBadge number={plate} size="lg" />
        </View>
      ) : null}
      {choosing ? (
        <Stack gap={spacing.xs} testID="vehicle-candidates">
          <AppText variant="smallStrong">{he.vehicleSearch.choose}</AppText>
          {candidates.map((c, i) => (
            <Card key={`${c.model}-${i}`} compact>
              <ListRow
                testID={`vehicle-candidate-${i}`}
                icon={c.type ? vehicleKindIcon[c.type] : 'car'}
                title={`${c.manufacturer} ${c.model} ${c.year || ''}`.trim()}
                subtitle={joinParts([c.trim, c.engine])}
                onPress={() => {
                  const { draft: d, origins } = draftFromRegistry(plate, c);
                  setIdentified(d, origins);
                  setCandidates([]);
                }}
              />
            </Card>
          ))}
        </Stack>
      ) : (
        <>
          <AppText variant="title" align="center" accessibilityRole="header">
            {[draft.manufacturer, draft.model, draft.year].filter(Boolean).join(' ')}
          </AppText>
          {draft.registryRecord ? <RegistryFacts record={draft.registryRecord} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
});
