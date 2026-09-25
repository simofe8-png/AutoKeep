import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { VehicleSummary } from './types';

/**
 * Active Vehicle Context (UX baseline "Multiple vehicles").
 *
 * The whole app operates in an explicit active-vehicle context. Switching changes display
 * context only — it never changes ownership or data (invariant 15). Screens read vehicle-scoped
 * data by passing `activeVehicleId` explicitly; nothing is implicitly global.
 */
export interface ActiveVehicleContextValue {
  vehicles: readonly VehicleSummary[];
  activeVehicle: VehicleSummary | null;
  activeVehicleId: string | null;
  setActiveVehicleId: (id: string) => void;
  /** True while the shell is fed by labeled mock data (UI prototype). */
  isDemoData: boolean;
}

const Ctx = createContext<ActiveVehicleContextValue | null>(null);

export interface ActiveVehicleProviderProps {
  vehicles: readonly VehicleSummary[];
  initialActiveId?: string | null;
  isDemoData?: boolean;
  children: ReactNode;
}

export function ActiveVehicleProvider({
  vehicles,
  initialActiveId,
  isDemoData = false,
  children,
}: ActiveVehicleProviderProps) {
  const selectable = useMemo(() => vehicles.filter((v) => !v.archived), [vehicles]);
  const [activeId, setActiveId] = useState<string | null>(
    () => initialActiveId ?? selectable[0]?.id ?? null,
  );

  const setActiveVehicleId = useCallback(
    (id: string) => {
      // Only an existing, non-archived vehicle can become the active context.
      if (selectable.some((v) => v.id === id)) setActiveId(id);
    },
    [selectable],
  );

  const activeVehicle = selectable.find((v) => v.id === activeId) ?? selectable[0] ?? null;

  const value = useMemo<ActiveVehicleContextValue>(
    () => ({
      vehicles,
      activeVehicle,
      activeVehicleId: activeVehicle?.id ?? null,
      setActiveVehicleId,
      isDemoData,
    }),
    [vehicles, activeVehicle, setActiveVehicleId, isDemoData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveVehicle(): ActiveVehicleContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useActiveVehicle must be used inside ActiveVehicleProvider');
  return v;
}
