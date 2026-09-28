import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { DISPLAY_FIELDS, DraftFieldInput, toDraftValue } from '@/features/onboarding/fields';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { RegistryLookup } from '@/features/onboarding/RegistryLookup';
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
  const { draft, setUserFields, setFields } = useOnboarding();
  const { isDemoData, network } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  /** Values filled from the official registry (kept as registry-origin unless edited). */
  const [fromRegistry, setFromRegistry] = useState<Partial<VehicleDraft>>({});
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
  // A typed engine code that is not well-formed is flagged — never silently dropped or "fixed".
  const codeInvalid = Boolean(inputs.engineCode?.trim()) && parsed.engineCode === undefined;
  const incomplete = missingFields(parsed).length > 0 || codeInvalid;

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
            const entries = Object.entries(parsed) as [DraftField, VehicleDraft[DraftField]][];
            const registry = Object.fromEntries(
              entries.filter(([k, v]) => fromRegistry[k] !== undefined && fromRegistry[k] === v),
            ) as Partial<VehicleDraft>;
            // Only fields the user changed are marked as user-entered.
            const changed = Object.fromEntries(
              entries.filter(([k, v]) => draft[k] !== v && registry[k] === undefined),
            ) as Partial<VehicleDraft>;
            if (Object.keys(registry).length > 0) setFields(registry, 'registry');
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
            error={f === 'engineCode' && codeInvalid ? he.lifecycle.invalidEngineCode : undefined}
            onChange={(v) => setInputs((s) => ({ ...s, [f]: v }))}
          />
        ))}
        {services ? (
          <RegistryLookup
            plate={inputs.registration ?? ''}
            registry={services.registry}
            offline={network === 'offline'}
            onFilled={(filled) => {
              setFromRegistry(filled);
              setInputs((s) => ({
                ...s,
                ...Object.fromEntries(Object.entries(filled).map(([k, v]) => [k, String(v)])),
              }));
            }}
          />
        ) : null}
      </Stack>
    </Screen>
  );
}
