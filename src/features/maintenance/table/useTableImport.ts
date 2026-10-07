import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { ocrBridge } from '@/features/maintenance/msource/ocrBridge';
import { he } from '@/i18n/he';

import { parseTablePages, type RawTablePage } from './parseTable';
import type { AcquiredFile } from '@/providers/acquisition/types';

import { scanImages } from './scanImages';

/**
 * Photograph / upload the owner's booklet table → read it on the device → save it as a proposal
 * the owner reviews (owner decision 2026-10-06). The original is kept as the vehicle's maintenance
 * document. The reading state lives outside any screen, so it survives leaving the window.
 */

export type ImportFailure = keyof typeof he.serviceTable.readFailed;

export type ImportState =
  | { kind: 'idle' }
  /** Pages photographed so far; the owner adds another or reads them. */
  | { kind: 'pages'; count: number }
  | { kind: 'reading'; page: number; pages: number }
  | { kind: 'failed'; reason: ImportFailure };

const IDLE: ImportState = { kind: 'idle' };
const states = new Map<string, ImportState>();
/** Photographed pages waiting to be read together (per vehicle). */
const shots = new Map<string, AcquiredFile[]>();
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

  /** Every page of every file, read together as ONE table; true once a proposal was saved. */
  const read = async (files: AcquiredFile[]): Promise<boolean> => {
    shots.delete(vehicleId);
    set(vehicleId, { kind: 'reading', page: 1, pages: files.length });
    try {
      const images: Uint8Array[] = [];
      for (const f of files) {
        const bytes = await new File(f.uri).bytes();
        images.push(...(f.mimeType === 'application/pdf' ? scanImages(bytes) : [bytes]));
      }
      if (!images.length) {
        set(vehicleId, { kind: 'failed', reason: 'not_scan' });
        return false;
      }
      const documentIds = files.map((file) => {
        const documentId = newLocalId('doc');
        addDocument(
          vehicleId,
          { documentId, file, title: he.documents.kinds.maintenance_schedule },
          'maintenance_schedule',
        );
        return documentId;
      });
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
        documentId: documentIds[0],
        unsure: parsed.unsure,
      });
      set(vehicleId, IDLE);
      return true;
    } catch {
      set(vehicleId, { kind: 'failed', reason: 'error' });
      return false;
    }
  };

  /**
   * Camera: one page per photo, then the owner adds another page or reads them (resolves false
   * while pages are being collected). File: one or several files picked at once, read together.
   */
  const start = async (from: 'camera' | 'file'): Promise<boolean> => {
    if (!services) {
      set(vehicleId, { kind: 'failed', reason: 'unavailable' });
      return false;
    }
    if (states.get(vehicleId)?.kind === 'reading') return false;
    const a = services.acquisition;
    if (from === 'camera') {
      const r = await a.captureWithCamera();
      if (r.status === 'cancelled') return false;
      if (r.status !== 'acquired') {
        set(vehicleId, { kind: 'failed', reason: 'error' });
        return false;
      }
      const pages = [...(shots.get(vehicleId) ?? []), r.file];
      shots.set(vehicleId, pages);
      set(vehicleId, { kind: 'pages', count: pages.length });
      return false;
    }
    const r = a.pickDocuments
      ? await a.pickDocuments()
      : await a
          .pickDocument()
          .then((x) =>
            x.status === 'acquired' ? { status: 'acquired' as const, files: [x.file] } : x,
          );
    if (r.status === 'cancelled') return false;
    if (r.status !== 'acquired') {
      set(vehicleId, { kind: 'failed', reason: 'error' });
      return false;
    }
    return read(r.files);
  };

  return {
    state,
    start,
    /** Reads the photographed pages together. */
    readPages: () => read(shots.get(vehicleId) ?? []),
    available: services !== null,
    dismiss: () => {
      shots.delete(vehicleId);
      set(vehicleId, IDLE);
    },
  };
}
