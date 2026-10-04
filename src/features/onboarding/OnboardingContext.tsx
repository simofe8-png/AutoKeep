import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { ScanScenario } from '@/mocks/onboarding';
import type { AcquisitionResult } from '@/providers/acquisition/types';
import type { RegistryVehicle } from '@/providers/registry/types';

import type { DraftField, FieldOrigin, VehicleDraft } from './types';

export interface OnboardingState {
  draft: VehicleDraft;
  origins: Partial<Record<DraftField, FieldOrigin>>;
  odometerKm?: number;
  scanScenario: ScanScenario;
  /** The captured/picked registration image (real mode). */
  acquired: AcquisitionResult | null;
  /** Several Ministry records for one plate: the user chooses on the details step. */
  candidates: RegistryVehicle[];
}

export interface OnboardingValue extends OnboardingState {
  /**
   * Replace the draft with identified data. Fields are marked as coming from the scan unless
   * explicit origins are given (e.g. the official registry).
   */
  setIdentified: (draft: VehicleDraft, origins?: OnboardingState['origins']) => void;
  /** Merge fields from a given origin (user entry or official registry). */
  setFields: (fields: Partial<VehicleDraft>, origin: FieldOrigin) => void;
  setAcquired: (a: AcquisitionResult | null) => void;
  setCandidates: (c: RegistryVehicle[]) => void;
  /** Set fields entered by the user (marked as user-entered). */
  setUserFields: (fields: Partial<VehicleDraft>) => void;
  setOdometer: (km: number) => void;
  setScanScenario: (s: ScanScenario) => void;
  reset: () => void;
}

const initial: OnboardingState = {
  draft: {},
  origins: {},
  scanScenario: 'success',
  acquired: null,
  candidates: [],
};

const Ctx = createContext<OnboardingValue | null>(null);

function merge(
  s: OnboardingState,
  fields: Partial<VehicleDraft>,
  origin: FieldOrigin,
): OnboardingState {
  return {
    ...s,
    draft: { ...s.draft, ...fields },
    origins: {
      ...s.origins,
      ...Object.fromEntries(Object.keys(fields).map((k) => [k, origin])),
    },
  };
}

/** Draft state shared by the onboarding steps. Used for first vehicle and "add vehicle" alike. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initial);

  const value = useMemo<OnboardingValue>(
    () => ({
      ...state,
      setIdentified: (draft, origins) =>
        setState((s) => ({
          ...s,
          draft,
          origins:
            origins ??
            (Object.fromEntries(
              Object.keys(draft).map((k) => [k, 'scan' as FieldOrigin]),
            ) as OnboardingState['origins']),
        })),
      setFields: (fields, origin) => setState((s) => merge(s, fields, origin)),
      setUserFields: (fields) => setState((s) => merge(s, fields, 'user')),
      setAcquired: (acquired) => setState((s) => ({ ...s, acquired })),
      setCandidates: (candidates) => setState((s) => ({ ...s, candidates })),
      setOdometer: (km) => setState((s) => ({ ...s, odometerKm: km })),
      setScanScenario: (scanScenario) => setState((s) => ({ ...s, scanScenario })),
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
