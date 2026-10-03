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
import {
  modelPhotoHost,
  onboardingServices,
  referenceImageCatalog,
} from '@/features/data/dataSource';
import { vehicleClass, type VehicleClass } from '@/identification/vehicleClass';

import { resolveModelPhoto, type ModelPhotoResolution } from './modelPhoto';
import {
  IMAGE_SEARCH_TIMEOUT_MS,
  resolveReferenceImage,
  type ReferenceResolution,
} from './referenceResolution';
import type { VehicleSummary } from './types';

/**
 * Vehicle image state (owner decisions 2026-09-29). Display priority:
 *   1. the user's own photo;
 *   2. the verified model reference image (credited, no visible label);
 *   3. a general model photo from Wikimedia (license-checked, credited, LABELLED as general: it
 *      may show another generation / body / color — owner decision 2026-10-03);
 *   4. the illustration.
 * While a reference is being resolved the image area says so (never a generic car presented as
 * the result); "no suitable image", "cannot search now" and "which front?" are distinct states.
 */
export type VehicleImageState =
  | { kind: 'user'; uri: string }
  | { kind: 'searching' }
  | Extract<ReferenceResolution, { kind: 'reference' }>
  | Extract<ReferenceResolution, { kind: 'choose_phase' }>
  | Extract<ModelPhotoResolution, { kind: 'model_photo' }>
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  /** No search in this build, or the user answered "לא עכשיו" / "לא בטוח". */
  | { kind: 'illustration' };

type Resolved = ReferenceResolution | Extract<ModelPhotoResolution, { kind: 'model_photo' }>;

interface Entry {
  sig: string;
  state: Resolved | { kind: 'searching' };
}

interface Ctx {
  /** Some image search is configured (approved catalog and/or general model photos). */
  enabled: boolean;
  entries: Record<string, Entry>;
  ensure: (
    vehicleId: string,
    cls: VehicleClass,
    sig: string,
    subject: { manufacturer: string; model: string },
    force?: boolean,
  ) => void;
  seed: (vehicleId: string, sig: string, state: ReferenceResolution) => void;
}

const VehicleImageCtx = createContext<Ctx | null>(null);

const signature = (cls: VehicleClass, subject?: { manufacturer?: string; model?: string }) =>
  JSON.stringify([cls, subject?.manufacturer ?? '', subject?.model ?? '']);

async function withTimeout<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function VehicleImageProvider({ children }: { children: ReactNode }) {
  const [catalog] = useState(referenceImageCatalog);
  const [photos] = useState(modelPhotoHost);
  const { modelPhotoCache } = useAppData();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const current = useRef(new Map<string, string>());
  const enabled = Boolean(catalog || (photos && modelPhotoCache));

  const ensure = useCallback<Ctx['ensure']>(
    (vehicleId, cls, sig, subject, force = false) => {
      if (!enabled) return;
      if (!force && current.current.get(vehicleId) === sig) return;
      current.current.set(vehicleId, sig);
      setEntries((e) => ({ ...e, [vehicleId]: { sig, state: { kind: 'searching' } } }));
      const resolve = async (): Promise<Resolved> => {
        const approved: ReferenceResolution =
          catalog && cls.kind !== 'unsupported'
            ? await resolveReferenceImage(cls, catalog)
            : { kind: 'not_found' };
        // The approved reference wins; a general model photo only when there is none.
        if (approved.kind !== 'not_found' || !photos || !modelPhotoCache) return approved;
        return withTimeout<Resolved>(
          resolveModelPhoto(subject, {
            ...photos,
            cache: modelPhotoCache,
            now: () => new Date().toISOString(),
          }),
          { kind: 'unavailable' },
          IMAGE_SEARCH_TIMEOUT_MS,
        );
      };
      void resolve().then((state) => {
        if (current.current.get(vehicleId) !== sig) return; // superseded
        setEntries((e) => ({ ...e, [vehicleId]: { sig, state } }));
      });
    },
    [enabled, catalog, photos, modelPhotoCache],
  );

  const seed = useCallback<Ctx['seed']>((vehicleId, sig, state) => {
    current.current.set(vehicleId, sig);
    setEntries((e) => ({ ...e, [vehicleId]: { sig, state } }));
  }, []);

  const value = useMemo(
    () => ({ enabled, entries, ensure, seed }),
    [enabled, entries, ensure, seed],
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
  const sig = signature(cls, full ?? undefined);
  const searchable = Boolean(ctx?.enabled && full && !isDemoData);
  const subject = useMemo(
    () => ({ manufacturer: full?.manufacturer ?? '', model: full?.model ?? '' }),
    [full?.manufacturer, full?.model],
  );

  useEffect(() => {
    if (searchable && id) ctx!.ensure(id, cls, sig, subject);
  }, [searchable, id, sig, cls, ctx, subject]);

  const acquisition = isDemoData ? null : (onboardingServices()?.acquisition ?? null);
  const acquire = async (from: 'camera' | 'library') => {
    if (!acquisition || !id) return;
    const r =
      from === 'camera' ? await acquisition.captureWithCamera() : await acquisition.pickImage();
    if (r.status === 'acquired') setVehiclePhoto(id, r.file);
  };

  const actions: VehicleImageActions = {
    retry: () => {
      if (searchable && id) ctx!.ensure(id, cls, sig, subject, true);
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
          ctx.seed(id, signature(next, full), {
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
