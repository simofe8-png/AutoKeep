import { htmlTextReader } from '@/discovery/maintenance/htmlText';
import { ownerProposals } from '@/discovery/maintenance/msource/ownerReview';
import {
  buildFingerprint,
  type FingerprintInput,
} from '@/discovery/maintenance/msource/fingerprint';
import {
  readOwnerDocuments,
  type MSourceRun,
  type OwnerDocument,
} from '@/discovery/maintenance/msource/run';
import type { TextReader } from '@/discovery/maintenance/types';
import type { IsoDate } from '@/domain';

import { uploadLog } from './devLog';

/**
 * Reads the owner's own maintenance documents for one vehicle (owner decision 2026-10-04: AutoKeep
 * never looks for a schedule by itself). Runs after the owner uploads a booklet; the items it finds
 * are proposed for owner review and become schedule items only once accepted.
 */

export interface OwnerDocumentsHost {
  sha256: (b: Uint8Array) => Promise<string>;
  /** Reads the owner's uploaded PDFs on the device (WebView pdf.js, D-A1). */
  uploadPdf: TextReader | null;
}

export interface OwnerDocumentsInput {
  vehicleId: string;
  input: FingerprintInput;
  serviceRegime: string | null;
  uploads: OwnerDocument[];
}

/** Storage port, implemented by the local store (serialized writes). */
export interface OwnerDocumentsStore {
  load(vehicleId: string): Promise<OwnerDocumentsInput | null>;
  complete(vehicleId: string, run: MSourceRun): Promise<void>;
}

export type OwnerDocumentsOutcome =
  | {
      read: false;
      reason: 'not_found' | 'identity_incomplete' | 'no_documents' | 'already_running';
    }
  | { read: true; run: MSourceRun };

const running = new Set<string>();
/**
 * A request while a reading is in progress (e.g. a second upload right after the first): that
 * reading loaded its documents before the request, so exactly one follow-up reading runs when it
 * ends — an upload is never lost.
 */
const rerun = new Set<string>();

export async function readOwnerDocumentsFor(
  vehicleId: string,
  store: OwnerDocumentsStore,
  host: OwnerDocumentsHost,
  clock: { now: () => string; today: () => string },
): Promise<OwnerDocumentsOutcome> {
  if (running.has(vehicleId)) {
    rerun.add(vehicleId);
    uploadLog('queued after the current reading', { reason: 'already_running' });
    return { read: false, reason: 'already_running' };
  }
  running.add(vehicleId);
  try {
    const data = await store.load(vehicleId);
    uploadLog('loaded', {
      uploads: data?.uploads.length ?? null,
      uploadBytes: data?.uploads.map((u) => u.bytes.length) ?? [],
    });
    if (!data) return { read: false, reason: 'not_found' };
    if (!data.uploads.length) return { read: false, reason: 'no_documents' };
    const built = buildFingerprint(data.input);
    if (!built.ok) return { read: false, reason: 'identity_incomplete' };
    const run = await readOwnerDocuments(built.fingerprint, data.uploads, {
      runId: `owner-${vehicleId.slice(0, 8)}-${clock.now().replace(/[^0-9]/g, '')}`,
      vehicleRef: vehicleId,
      readers: { pdf: host.uploadPdf, html: htmlTextReader },
      sha256: host.sha256,
      today: clock.today() as IsoDate,
      now: clock.now,
      facts: { serviceRegime: data.serviceRegime },
    });
    await store.complete(vehicleId, run);
    uploadLog('read', {
      traces: run.candidates.map((c) => ({
        outcome: c.outcome,
        failure: c.failure ? `${c.failure.code}: ${c.failure.detail.slice(0, 120)}` : null,
      })),
      proposals: run.schedule ? ownerProposals(run.schedule).length : 0,
    });
    return { read: true, run };
  } finally {
    running.delete(vehicleId);
    if (rerun.delete(vehicleId)) {
      void readOwnerDocumentsFor(vehicleId, store, host, clock).catch(() => undefined);
    }
  }
}

export const isReadingOwnerDocuments = (vehicleId: string) => running.has(vehicleId);
