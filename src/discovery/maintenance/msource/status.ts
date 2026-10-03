import type { MSourceRun, MSourceStage } from './run';

/**
 * User-facing discovery state (Phase 18). Progress states while a run is active; one terminal
 * state after it. Retry and document upload are offered whenever no complete schedule exists.
 */
export type DiscoveryState =
  | 'IDENTIFYING_VEHICLE'
  | 'DISCOVERING_SOURCES'
  | 'FOUND_SOURCES'
  | 'VERIFYING_MATCH'
  | 'BUILDING_SCHEDULE'
  | 'READY'
  /** Only owner-conditional items (e.g. the service-plan code is needed). */
  | 'CONDITIONALLY_READY'
  | 'NO_SOURCE_FOUND'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONFLICTING_EVIDENCE';

export interface DiscoveryStatus {
  state: DiscoveryState;
  /** READY with only some obligations established (labelled partial in the UI). */
  partial: boolean;
  retryAvailable: boolean;
  uploadDocumentAvailable: boolean;
  /** Counts for the UI (no URLs or document contents). */
  sourcesFound: number;
  sourcesUsed: number;
  runId?: string;
  updatedAt: string;
  /** The run failed technically (network, host) — distinct from "no evidence". */
  error?: string;
  /** Version of the bundled class catalog the run searched (stale when the app ships a newer one). */
  catalogVersion?: string;
}

const PROGRESS_STATES: readonly DiscoveryState[] = [
  'IDENTIFYING_VEHICLE',
  'DISCOVERING_SOURCES',
  'FOUND_SOURCES',
  'VERIFYING_MATCH',
  'BUILDING_SCHEDULE',
];

/** A result without a complete schedule is searched again after this long (on app start). */
export const RESEARCH_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Whether a vehicle needs a (new) automatic discovery run — no manual "search again": never run,
 * interrupted, or an incomplete result that is stale (searched against an older bundled catalog,
 * or older than RESEARCH_AFTER_MS). A complete schedule is not searched again.
 */
export function needsDiscovery(
  d: DiscoveryStatus | null | undefined,
  catalogVersion: string | undefined,
  now: number,
): boolean {
  if (!d || !d.updatedAt || PROGRESS_STATES.includes(d.state)) return true;
  if (d.state === 'READY' && !d.partial) return false;
  if (catalogVersion && d.catalogVersion !== catalogVersion) return true;
  return now - Date.parse(d.updatedAt) > RESEARCH_AFTER_MS;
}

export function progressState(stage: MSourceStage): DiscoveryState {
  switch (stage) {
    case 'VEHICLE_VERIFIED':
      return 'IDENTIFYING_VEHICLE';
    case 'DISCOVERY':
      return 'DISCOVERING_SOURCES';
    case 'SOURCE_CANDIDATES':
    case 'ACQUISITION':
      return 'FOUND_SOURCES';
    case 'EXTRACTION':
    case 'VEHICLE_MATCHING':
      return 'VERIFYING_MATCH';
    default:
      return 'BUILDING_SCHEDULE';
  }
}

export function terminalStatus(run: MSourceRun, at: string): DiscoveryStatus {
  const s = run.schedule;
  const sourcesUsed = s
    ? new Set(s.items.flatMap((i) => i.evidenceIds.map((id) => id.split(':')[0]))).size
    : 0;
  const base = {
    sourcesFound: run.candidates.length,
    sourcesUsed,
    runId: run.runId,
    updatedAt: at,
  };
  const state: DiscoveryState =
    !s || s.status === 'NO_SOURCE_FOUND'
      ? 'NO_SOURCE_FOUND'
      : s.status === 'READY' || s.status === 'READY_PARTIAL'
        ? 'READY'
        : s.status === 'CONDITIONAL'
          ? 'CONDITIONALLY_READY'
          : s.status === 'CONFLICTING_EVIDENCE'
            ? 'CONFLICTING_EVIDENCE'
            : 'INSUFFICIENT_EVIDENCE';
  const complete = s?.status === 'READY';
  return {
    ...base,
    state,
    partial: s?.status === 'READY_PARTIAL',
    retryAvailable: !complete,
    uploadDocumentAvailable: !complete,
  };
}
