import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { ScanScenario, SourceScenario } from '@/mocks/onboarding';

import type { DraftField, FieldOrigin, VehicleDraft } from './types';

export interface OnboardingState {
  draft: VehicleDraft;
  origins: Partial<Record<DraftField, FieldOrigin>>;
  odometerKm?: number;
  scanScenario: ScanScenario;
  sourceScenario: SourceScenario;
}

export interface OnboardingValue extends OnboardingState {
  /** Replace the draft with identified data (all fields marked as coming from the scan). */
  setIdentified: (draft: VehicleDraft) => void;
  /** Set fields entered by the user (marked as user-entered). */
  setUserFields: (fields: Partial<VehicleDraft>) => void;
  setOdometer: (km: number) => void;
  setScanScenario: (s: ScanScenario) => void;
  setSourceScenario: (s: SourceScenario) => void;
  reset: () => void;
}

const initial: OnboardingState = {
  draft: {},
  origins: {},
  scanScenario: 'success',
  sourceScenario: 'verified',
};

const Ctx = createContext<OnboardingValue | null>(null);

/** Draft state shared by the onboarding steps. Used for first vehicle and "add vehicle" alike. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initial);

  const value = useMemo<OnboardingValue>(
    () => ({
      ...state,
      setIdentified: (draft) =>
        setState((s) => ({
          ...s,
          draft,
          origins: Object.fromEntries(
            Object.keys(draft).map((k) => [k, 'scan' as FieldOrigin]),
          ) as OnboardingState['origins'],
        })),
      setUserFields: (fields) =>
        setState((s) => ({
          ...s,
          draft: { ...s.draft, ...fields },
          origins: {
            ...s.origins,
            ...Object.fromEntries(Object.keys(fields).map((k) => [k, 'user' as FieldOrigin])),
          },
        })),
      setOdometer: (km) => setState((s) => ({ ...s, odometerKm: km })),
      setScanScenario: (scanScenario) => setState((s) => ({ ...s, scanScenario })),
      setSourceScenario: (sourceScenario) => setState((s) => ({ ...s, sourceScenario })),
      reset: () => setState(initial),
    }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return v;
}
