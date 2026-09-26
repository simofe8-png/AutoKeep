import { useState } from 'react';

import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { joinParts } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import type { IdentificationDraft } from '@/identification/engine';
import { applyRegistry, identifyByRegistration } from '@/identification/registry';
import type { RegistryVehicle } from '@/providers/registry/types';
import { AppText, Button, Card, InlineNotice, ListRow, spacing, Stack } from '@/ui';

import { toOnboardingDraft } from './services';
import type { DraftField, FieldOrigin, VehicleDraft } from './types';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'notice'; tone: 'success' | 'warning'; message: string }
  | { kind: 'choose'; draft: IdentificationDraft; candidates: RegistryVehicle[] };

export interface RegistryLookupProps {
  plate: string;
  offline?: boolean;
  registry: Parameters<typeof identifyByRegistration>[1];
  onFilled: (draft: VehicleDraft, origins: Partial<Record<DraftField, FieldOrigin>>) => void;
}

/**
 * Official registry lookup (ADR-0012). Pressing the button — after the notice that states exactly
 * what is sent — is the user's consent. Only the registration number leaves the device.
 */
export function RegistryLookup({ plate, registry, onFilled, offline }: RegistryLookupProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const fill = (d: IdentificationDraft) => {
    const { draft, origins } = toOnboardingDraft(d);
    // The plate is what the user typed; it stays user-entered.
    delete draft.registration;
    delete origins.registration;
    onFilled(draft, origins);
    setState({ kind: 'notice', tone: 'success', message: he.onboarding.registryFound });
  };

  const lookup = async () => {
    setState({ kind: 'loading' });
    const r = await identifyByRegistration(plate, registry, true);
    if (r.kind === 'draft') return fill(r.draft);
    if (r.kind === 'needs_selection') {
      return setState({
        kind: 'choose',
        draft: r.draft,
        candidates: r.candidates as RegistryVehicle[],
      });
    }
    setState({
      kind: 'notice',
      tone: 'warning',
      message:
        r.reason === 'registry_unavailable'
          ? he.onboarding.registryUnavailable
          : r.reason === 'registry_not_found'
            ? he.onboarding.registryNotFound
            : he.onboarding.registryNeedsPlate,
    });
  };

  return (
    <Card tone="muted" testID="registry-lookup">
      <Stack gap={spacing.sm}>
        <AppText variant="small" color="textSecondary">
          {he.onboarding.registryConsent}
        </AppText>
        <Button
          testID="registry-lookup-button"
          label={he.onboarding.registryLookup}
          icon="database-search-outline"
          variant="secondary"
          fullWidth
          loading={state.kind === 'loading'}
          disabled={state.kind === 'loading' || offline}
          onPress={() => void lookup()}
        />
        {offline ? (
          <InlineNotice
            testID="registry-offline"
            tone="neutral"
            message={he.onboarding.registryOffline}
          />
        ) : null}
        {state.kind === 'notice' ? (
          <InlineNotice testID="registry-result" tone={state.tone} message={state.message} />
        ) : null}
        {state.kind === 'choose' ? (
          <Stack testID="registry-candidates" gap={spacing.xs}>
            <AppText variant="smallStrong">{he.onboarding.registryChoose}</AppText>
            {state.candidates.map((c, i) => (
              <ListRow
                key={`${c.model}-${i}`}
                testID={`registry-candidate-${i}`}
                icon={c.type ? vehicleKindIcon[c.type] : 'car'}
                title={`${c.manufacturer} ${c.model} ${c.year}`}
                subtitle={joinParts([c.trim, c.engine])}
                onPress={() => fill(applyRegistry(state.draft, c))}
              />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
