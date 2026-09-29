import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ExteriorPhase } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import { onboardingServices, referenceImageCatalog } from '@/features/data/dataSource';
import { vehicleClass, type VehicleClass } from '@/identification/vehicleClass';
import type { ReferenceImageCatalog } from '@/providers/referenceImages/types';

import { resolveReferenceImage, type ReferenceResolution } from './referenceResolution';
import type { VehicleSummary } from './types';

/**
 * Vehicle image state (owner decisions 2026-09-29). Display priority:
 *   1. the user's own photo;
 *   2. the verified model reference image (credited, no visible label);
 *   3/4. the illustration.
 * While a reference is being resolved the image area says so (never a generic car presented as
 * the result); "no suitable image", "cannot search now" and "which front?" are distinct states.
 */
export type VehicleImageState =
  | { kind: 'user'; uri: string }
  | { kind: 'searching' }
  | Extract<ReferenceResolution, { kind: 'reference' }>
  | Extract<ReferenceResolution, { kind: 'choose_phase' }>
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  /** No search in this build, or the user answered "לא עכשיו" / "לא בטוח". */
  | { kind: 'illustration' };

interface Entry {
  sig: string;
  state: ReferenceResolution | { kind: 'searching' };
}

interface Ctx {
  catalog: ReferenceImageCatalog | null;
  entries: Record<string, Entry>;
  ensure: (vehicleId: string, cls: VehicleClass, sig: string, force?: boolean) => void;
  seed: (vehicleId: string, sig: string, state: ReferenceResolution) => void;
}

const VehicleImageCtx = createContext<Ctx | null>(null);

const signature = (cls: VehicleClass) => JSON.stringify(cls);

export function VehicleImageProvider({ children }: { children: ReactNode }) {
  const [catalog] = useState(referenceImageCatalog);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const current = useRef(new Map<string, string>());

  const ensure = useCallback<Ctx['ensure']>(
    (vehicleId, cls, sig, force = false) => {
      if (!catalog) return;
      if (!force && current.current.get(vehicleId) === sig) return;
      current.current.set(vehicleId, sig);
      setEntries((e) => ({ ...e, [vehicleId]: { sig, state: { kind: 'searching' } } }));
      void resolveReferenceImage(cls, catalog).then((state) => {
        if (current.current.get(vehicleId) !== sig) return; // superseded
        setEntries((e) => ({ ...e, [vehicleId]: { sig, state } }));
      });
    },
    [catalog],
  );

  const seed = useCallback<Ctx['seed']>((vehicleId, sig, state) => {
    current.current.set(vehicleId, sig);
    setEntries((e) => ({ ...e, [vehicleId]: { sig, state } }));
  }, []);

  const value = useMemo(
    () => ({ catalog, entries, ensure, seed }),
    [catalog, entries, ensure, seed],
  );
  return <VehicleImageCtx.Provider value={value}>{children}</VehicleImageCtx.Provider>;
}

type ImageSubject = Pick<VehicleSummary, 'kind'> & Partial<VehicleSummary>;

function isFullVehicle(v: ImageSubject): v is VehicleSummary {
  return Boolean(v.id && v.manufacturer && v.model);
}

export interface VehicleImageActions {
  retry: () => void;
  notNow: () => void;
  /** The user's answer to "which front?"; null = "לא בטוח". */
  choosePhase: (phase: ExteriorPhase | null) => void;
  capture: () => Promise<void>;
  pick: () => Promise<void>;
  canAcquire: boolean;
}

export function useVehicleImage(vehicle: ImageSubject): {
  state: VehicleImageState;
  actions: VehicleImageActions;
} {
  const ctx = useContext(VehicleImageCtx);
  const {
    vehiclePhotos,
    imagePromptDismissed,
    setImagePromptDismissed,
    setVehiclePhoto,
    updateVehicleDetails,
    isDemoData,
  } = useAppData();
  const full = isFullVehicle(vehicle) ? vehicle : null;
  const id = vehicle.id;
  const userUri = id ? vehiclePhotos[id] : undefined;
  const cls = useMemo<VehicleClass>(
    () =>
      full
        ? vehicleClass({
            kind: full.kind,
            manufacturer: full.manufacturer,
            model: full.model,
            modelCode: full.modelCode,
            color: full.color,
            exteriorPhase: full.exteriorPhase,
          })
        : { kind: 'unsupported' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      full?.kind,
      full?.manufacturer,
      full?.model,
      full?.modelCode,
      full?.color,
      full?.exteriorPhase,
    ],
  );
  const sig = signature(cls);
  const searchable = Boolean(ctx?.catalog && full && !isDemoData);

  useEffect(() => {
    if (searchable && id) ctx!.ensure(id, cls, sig);
  }, [searchable, id, sig, cls, ctx]);

  const acquisition = isDemoData ? null : (onboardingServices()?.acquisition ?? null);
  const acquire = async (from: 'camera' | 'library') => {
    if (!acquisition || !id) return;
    const r =
      from === 'camera' ? await acquisition.captureWithCamera() : await acquisition.pickImage();
    if (r.status === 'acquired') setVehiclePhoto(id, r.file);
  };

  const actions: VehicleImageActions = {
    retry: () => {
      if (searchable && id) ctx!.ensure(id, cls, sig, true);
    },
    notNow: () => {
      if (id) setImagePromptDismissed(id, true);
    },
    choosePhase: (phase) => {
      if (!id || !full) return;
      const entry = ctx?.entries[id];
      if (phase === null) {
        setImagePromptDismissed(id, true);
        return;
      }
      // The answer is a user-confirmed identity attribute (synced); its image is already local.
      if (entry?.state.kind === 'choose_phase') {
        const option = entry.state.options.find((o) => o.phase === phase);
        const next = vehicleClass({ ...full, exteriorPhase: phase });
        if (option && ctx) {
          ctx.seed(id, signature(next), {
            kind: 'reference',
            uri: option.uri,
            record: option.record,
          });
        }
      }
      updateVehicleDetails(id, { exteriorPhase: phase });
    },
    capture: () => acquire('camera'),
    pick: () => acquire('library'),
    canAcquire: Boolean(acquisition && id),
  };

  let state: VehicleImageState;
  if (userUri) state = { kind: 'user', uri: userUri };
  else if (!searchable || !id) state = { kind: 'illustration' };
  else {
    const entry = ctx!.entries[id];
    const s = entry && entry.sig === sig ? entry.state : { kind: 'searching' as const };
    const dismissed = imagePromptDismissed[id] === true;
    state =
      s.kind === 'choose_phase' || s.kind === 'not_found'
        ? dismissed
          ? { kind: 'illustration' }
          : s
        : s;
  }
  return { state, actions };
}
