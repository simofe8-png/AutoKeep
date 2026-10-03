import { htmlTextReader } from '@/discovery/maintenance/htmlText';
import type { SourceSystem } from '@/discovery/maintenance/registry/sourceSystem';
import {
  FableDiscoveryAdapter,
  KnownCandidatesAdapter,
  RegistryDiscoveryAdapter,
  UploadDiscoveryAdapter,
  type DiscoveryAdapter,
  type ResearchProvider,
} from '@/discovery/maintenance/msource/adapters';
import { makeCandidate } from '@/discovery/maintenance/msource/candidates';
import { ownerProposals } from '@/discovery/maintenance/msource/ownerReview';
import {
  buildFingerprint,
  fingerprintKey,
  type FingerprintInput,
} from '@/discovery/maintenance/msource/fingerprint';
import type { MSourceLogger } from '@/discovery/maintenance/msource/log';
import type { GuardedFetchDeps } from '@/discovery/maintenance/msource/netGuard';
import { scheduleToRequirements } from '@/discovery/maintenance/msource/requirements';
import {
  runMSource,
  type CachedSource,
  type EvidenceCache,
  type MSourceRun,
} from '@/discovery/maintenance/msource/run';
import {
  progressState,
  terminalStatus,
  type DiscoveryStatus,
} from '@/discovery/maintenance/msource/status';
import { MSOURCE_VERSION } from '@/discovery/maintenance/msource/types';
import type { TextReader } from '@/discovery/maintenance/types';
import type { IsoDate, MaintenanceRequirement } from '@/domain';

import { discoveryLog, uploadLog } from './devLog';

/**
 * Application service for M-SOURCE (Phase 17): start / status / schedule / retry for one
 * vehicle. The long network run never blocks a screen: progress is written as it goes, the
 * result is persisted at the end, and the maintenance plan picks the requirements up on the
 * next snapshot. Uses the SAME runner as the worker host; what differs is only the ports
 * (no research assistant on the phone; web PDF evidence comes from the class-level catalog
 * produced by the worker host; the owner's own PDFs are read on the device and held for owner
 * review).
 */

export interface MSourceHost {
  net: GuardedFetchDeps;
  sha256: (b: Uint8Array) => Promise<string>;
  registry: readonly SourceSystem[];
  /** Class-level results produced by the worker host (structured evidence, no documents). */
  catalog: (classKey: string) => { canonicalUrl: string; value: CachedSource }[];
  research?: ResearchProvider | null;
  /** Reads the owner's own uploaded PDFs on the device (WebView pdf.js, D-A1); never web PDFs. */
  uploadPdf?: TextReader | null;
  log?: MSourceLogger;
}

export interface DiscoveryInput {
  vehicleId: string;
  input: FingerprintInput;
  serviceRegime: string | null;
  uploads: { id: string; name: string; bytes: Uint8Array }[];
  cached: { url: string; value: CachedSource }[];
}

/** Storage port, implemented by the local store (serialized writes). */
export interface DiscoveryStore {
  load(vehicleId: string): Promise<DiscoveryInput | null>;
  progress(
    vehicleId: string,
    runId: string,
    classKey: string,
    status: DiscoveryStatus,
  ): Promise<void>;
  complete(
    vehicleId: string,
    run: MSourceRun,
    status: DiscoveryStatus,
    requirements: MaintenanceRequirement[],
    cache: { classKey: string; url: string; value: CachedSource }[],
  ): Promise<void>;
}

export type DiscoveryOutcome =
  | { started: false; reason: 'not_found' | 'identity_incomplete' | 'already_running' }
  | { started: true; status: DiscoveryStatus };

const running = new Set<string>();
/**
 * A start requested while a run is in progress (e.g. the owner uploaded a document right after
 * adding the vehicle): that run loaded its inputs before the request, so exactly one follow-up
 * run starts when it ends — the request is never lost.
 */
const rerun = new Set<string>();

export async function startMaintenanceDiscovery(
  vehicleId: string,
  store: DiscoveryStore,
  host: MSourceHost,
  clock: { now: () => string; today: () => string },
): Promise<DiscoveryOutcome> {
  if (running.has(vehicleId)) {
    rerun.add(vehicleId);
    uploadLog('discovery: queued after the current run', { reason: 'already_running' });
    return { started: false, reason: 'already_running' };
  }
  running.add(vehicleId);
  try {
    const data = await store.load(vehicleId);
    uploadLog('discovery: loaded', {
      uploads: data?.uploads.length ?? null,
      uploadBytes: data?.uploads.map((u) => u.bytes.length) ?? [],
    });
    if (!data) return { started: false, reason: 'not_found' };
    const built = buildFingerprint(data.input);
    if (!built.ok) {
      discoveryLog('not started', { reason: 'identity_incomplete', missing: built.missing });
      return { started: false, reason: 'identity_incomplete' };
    }
    const fp = built.fingerprint;
    const classKey = fingerprintKey(fp);
    discoveryLog('start', { classKey, catalogSources: host.catalog(classKey).length });
    const runId = `run-${vehicleId.slice(0, 8)}-${clock.now().replace(/[^0-9]/g, '')}`;
    let last: DiscoveryStatus['state'] | null = null;
    const report = async (state: DiscoveryStatus['state']) => {
      if (state === last) return;
      last = state;
      await store.progress(vehicleId, runId, classKey, {
        state,
        partial: false,
        retryAvailable: false,
        uploadDocumentAvailable: false,
        sourcesFound: 0,
        sourcesUsed: 0,
        runId,
        updatedAt: clock.now(),
      });
    };
    await report('IDENTIFYING_VEHICLE');

    // Cache: what this device already learned + what the worker host published for the class.
    const cached = new Map<string, CachedSource>();
    for (const c of host.catalog(classKey)) cached.set(c.canonicalUrl, c.value);
    for (const c of data.cached) cached.set(c.url, c.value);
    const fresh: { classKey: string; url: string; value: CachedSource }[] = [];
    const cache: EvidenceCache = {
      get: (url, k) => (k === classKey ? (cached.get(url) ?? null) : null),
      put: (url, k, value) => {
        cached.set(url, value);
        fresh.push({ classKey: k, url, value });
      },
    };
    const known = [...cached.keys()].flatMap((url) => {
      const c = makeCandidate({
        url,
        sourceType: cached.get(url)!.provenance.sourceType,
        discoveredBy: 'catalog',
        discoveredAt: clock.now(),
      });
      return c ? [c] : [];
    });
    const adapters: DiscoveryAdapter[] = [
      new UploadDiscoveryAdapter(data.uploads),
      new KnownCandidatesAdapter(known),
      new FableDiscoveryAdapter(host.research ?? null),
      new RegistryDiscoveryAdapter(host.registry, host.net),
    ];
    const pending: Promise<void>[] = [];
    let run: MSourceRun;
    try {
      run = await runMSource(fp, {
        runId,
        vehicleRef: vehicleId,
        adapters,
        access: { registry: host.registry, net: host.net, now: clock.now, robots: new Map() },
        net: host.net,
        readers: { pdf: null, html: htmlTextReader, uploadPdf: host.uploadPdf ?? null },
        // The owner's documents become requirements only through owner review (D-A3).
        holdUploadsForOwnerReview: true,
        sha256: host.sha256,
        today: clock.today() as IsoDate,
        now: clock.now,
        facts: { serviceRegime: data.serviceRegime },
        cache,
        archive: true,
        log: host.log,
        onStage: (stage) => void pending.push(report(progressState(stage))),
      });
    } catch (e) {
      await Promise.all(pending);
      const status: DiscoveryStatus = {
        state: 'NO_SOURCE_FOUND',
        partial: false,
        retryAvailable: true,
        uploadDocumentAvailable: true,
        sourcesFound: 0,
        sourcesUsed: 0,
        runId,
        updatedAt: clock.now(),
        error: String(e).slice(0, 120),
      };
      await store.progress(vehicleId, runId, classKey, status);
      return { started: true, status };
    }
    await Promise.all(pending);
    const status = terminalStatus(run, clock.now());
    discoveryLog('done', {
      classKey,
      state: status.state,
      partial: status.partial,
      candidates: run.candidates.length,
      items:
        run.schedule?.items.map(
          (i) => `${i.task} ${i.intervalKm ?? '-'}km/${i.intervalMonths ?? '-'}m ${i.quality}`,
        ) ?? [],
    });
    const requirements = run.schedule
      ? scheduleToRequirements(run.schedule, fp, clock.today() as IsoDate)
      : [];
    await store.complete(vehicleId, run, status, requirements, fresh);
    if (data.uploads.length) {
      uploadLog('discovery: uploads processed', {
        traces: run.candidates
          .filter((c) => c.candidate.upload)
          .map((c) => ({
            outcome: c.outcome,
            failure: c.failure ? `${c.failure.code}: ${c.failure.detail.slice(0, 120)}` : null,
          })),
        uploadEvidence: run.schedule
          ? run.schedule.evidence.filter((e) =>
              run.schedule!.sources.some(
                (s) => s.sourceId === e.sourceId && s.sourceType === 'user_upload',
              ),
            ).length
          : 0,
        proposals: run.schedule ? ownerProposals(run.schedule).length : 0,
        state: status.state,
      });
    }
    return { started: true, status };
  } finally {
    running.delete(vehicleId);
    if (rerun.delete(vehicleId)) {
      void startMaintenanceDiscovery(vehicleId, store, host, clock).catch(() => undefined);
    }
  }
}

export const isDiscoveryRunning = (vehicleId: string) => running.has(vehicleId);

export { MSOURCE_VERSION };
