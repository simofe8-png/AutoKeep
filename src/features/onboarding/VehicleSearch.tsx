import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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
  colors,
  elevation,
  fontFamily,
  Icon,
  InlineNotice,
  ListRow,
  PlateBadge,
  radii,
  Screen,
  spacing,
  Stack,
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
 * The input is an Israeli plate (owner's choice 2026-10-04): large and centred.
 */
export function VehicleSearchScreen() {
  const router = useRouter();
  const registry = useRegistry();
  const { reset, setIdentified, setCandidates } = useOnboarding();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const t = he.vehicleSearch;

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
      ? t.invalid
      : problem?.kind === 'not_found'
        ? t.notFound
        : undefined;
  const onChange = (text: string) => {
    setValue(formatPlateInput(text));
    setProblem(null);
  };
  const input = (
    <TextInput
      testID="vehicle-search-plate"
      value={value}
      onChangeText={onChange}
      keyboardType="number-pad"
      maxLength={10}
      placeholder="00-000-00"
      placeholderTextColor="rgba(11,11,11,0.25)"
      accessibilityLabel={t.plateLabel}
      accessibilityHint={message}
      maxFontSizeMultiplier={1.2}
      style={styles.plateInput}
    />
  );
  const feedback = (
    <>
      {message ? (
        <AppText
          variant="small"
          color="danger"
          align="center"
          testID="vehicle-search-error"
          accessibilityLiveRegion="polite"
        >
          {message}
        </AppText>
      ) : null}
      {problem?.kind === 'unavailable' ? (
        <InlineNotice
          testID="vehicle-search-unavailable"
          tone="warning"
          message={t.unavailable}
          action={{ label: t.retry, icon: 'refresh', onPress: () => void find() }}
        />
      ) : null}
    </>
  );
  const findButton = (
    <Button
      testID="vehicle-search-find"
      label={t.find}
      icon="magnify"
      fullWidth
      loading={busy}
      disabled={busy}
      onPress={() => void find()}
    />
  );
  const title = (
    <AppText variant="title" align="center" accessibilityRole="header">
      {t.plateLabel}
    </AppText>
  );
  const hint = (
    <AppText color="textSecondary" align="center">
      {t.plateHint}
    </AppText>
  );
  const privacy = (
    <View style={styles.privacy}>
      <Icon name="shield-lock-outline" size={16} color="textMuted" />
      <AppText variant="caption" color="textMuted">
        {t.platePrivacy}
      </AppText>
    </View>
  );

  return (
    <Screen
      testID="screen-vehicle-search"
      header={<ScreenHeader title={t.title} closeIcon />}
      contentStyle={styles.centered}
    >
      <Stack gap={spacing.xxl}>
        {/* Owner request 2026-10-04: room between the text, the plate and the button. */}
        <Stack gap={spacing.sm}>
          {title}
          {hint}
        </Stack>
        <View style={[styles.plate, message ? styles.plateError : null]}>
          <View style={styles.plateStrip}>
            <AppText style={styles.plateIl}>IL</AppText>
          </View>
          {input}
        </View>
        {feedback}
        <Stack gap={spacing.md}>
          {findButton}
          {privacy}
        </Stack>
      </Stack>
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
  centered: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.xxxl },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  // The plate input.
  plate: {
    direction: 'ltr',
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    height: 84,
    borderRadius: radii.md,
    borderWidth: 3,
    borderColor: colors.plateText,
    backgroundColor: colors.plateYellow,
    overflow: 'hidden',
    ...elevation.raised,
  },
  plateError: { borderColor: colors.danger },
  plateStrip: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
    backgroundColor: colors.plateBlue,
  },
  plateIl: { color: colors.textOnPrimary, fontFamily: fontFamily.bold, fontSize: 16 },
  plateInput: {
    flex: 1,
    textAlign: 'center',
    writingDirection: 'ltr',
    fontFamily: fontFamily.bold,
    fontSize: 40,
    letterSpacing: 2,
    color: colors.plateText,
  },
});
