import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import type { DocumentVM } from '@/features/data/types';
import { he } from '@/i18n/he';

/**
 * Tap a document → its content opens (owner decision 2026-09-29): an image in the in-app
 * full-screen viewer, anything else (PDF) directly in the device's viewer. Opening only reads the
 * stored original: nothing is copied, re-uploaded or changed. A document without an intact file on
 * the device (or a prototype document) opens its details, which explain why.
 */
export function useOpenDocument() {
  const router = useRouter();
  const { isDemoData, getOriginal, openOriginal } = useAppData();
  const [problem, setProblem] = useState<string | null>(null);

  const open = useCallback(
    async (doc: Pick<DocumentVM, 'id' | 'vehicleId' | 'mimeType'>) => {
      setProblem(null);
      const details = () => router.push(`/documents/${doc.id}`);
      if (isDemoData || !doc.mimeType) return details();
      if (doc.mimeType.startsWith('image/')) return router.push(`/documents/view/${doc.id}`);
      const original = await getOriginal(doc.vehicleId, doc.id);
      if (!original || original.integrity !== 'intact') return details();
      if (!(await openOriginal(doc.vehicleId, doc.id))) setProblem(he.documents.openFailed);
    },
    [router, isDemoData, getOriginal, openOriginal],
  );

  return { open, problem };
}
