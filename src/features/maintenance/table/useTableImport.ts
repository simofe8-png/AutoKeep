import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { ocrBridge } from '@/features/maintenance/msource/ocrBridge';
import { he } from '@/i18n/he';

import { parseTablePages, type RawTablePage } from './parseTable';
import { scanImages } from './scanImages';

/**
 * Photograph / upload the owner's booklet table → read it on the device → save it as a proposal
 * the owner reviews (owner decision 2026-10-06). The original is kept as the vehicle's maintenance
 * document. The reading state lives outside any screen, so it survives leaving the window.
 */

export type ImportFailure = keyof typeof he.serviceTable.readFailed;

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading'; page: number; pages: number }
  | { kind: 'failed'; reason: ImportFailure };

const IDLE: ImportState = { kind: 'idle' };
const states = new Map<string, ImportState>();
const listeners = new Set<() => void>();

function set(vehicleId: string, s: ImportState) {
  states.set(vehicleId, s);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useTableImport(vehicleId: string) {
  const { isDemoData, addDocument, saveServiceTable } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  const state = useSyncExternalStore(subscribe, () => states.get(vehicleId) ?? IDLE);

  /** Resolves true once a proposal was saved for review. */
  const start = async (from: 'camera' | 'file'): Promise<boolean> => {
    if (!services) {
      set(vehicleId, { kind: 'failed', reason: 'unavailable' });
      return false;
    }
    if (states.get(vehicleId)?.kind === 'reading') return false;
    const r =
      from === 'camera'
        ? await services.acquisition.captureWithCamera()
        : await services.acquisition.pickDocument();
    if (r.status === 'cancelled') return false;
    if (r.status !== 'acquired') {
      set(vehicleId, { kind: 'failed', reason: 'error' });
      return false;
    }
    set(vehicleId, { kind: 'reading', page: 1, pages: 1 });
    try {
      const bytes = await new File(r.file.uri).bytes();
      const images = r.file.mimeType === 'application/pdf' ? scanImages(bytes) : [bytes];
      if (!images.length) {
        set(vehicleId, { kind: 'failed', reason: 'not_scan' });
        return false;
      }
      const documentId = newLocalId('doc');
      addDocument(
        vehicleId,
        { documentId, file: r.file, title: he.documents.kinds.maintenance_schedule },
        'maintenance_schedule',
      );
      const pages: RawTablePage[] = [];
      for (let i = 0; i < images.length; i++) {
        set(vehicleId, { kind: 'reading', page: i + 1, pages: images.length });
        const page = await ocrBridge.readTable(images[i]);
        if (page) pages.push(page);
      }
      const parsed = parseTablePages(pages);
      if (!parsed.ok) {
        set(vehicleId, { kind: 'failed', reason: parsed.reason });
        return false;
      }
      saveServiceTable(vehicleId, {
        table: parsed.table,
        status: 'proposed',
        source: 'photo',
        documentId,
        unsure: parsed.unsure,
      });
      set(vehicleId, IDLE);
      return true;
    } catch {
      set(vehicleId, { kind: 'failed', reason: 'error' });
      return false;
    }
  };

  return {
    state,
    start,
    available: services !== null,
    dismiss: () => set(vehicleId, IDLE),
  };
}
