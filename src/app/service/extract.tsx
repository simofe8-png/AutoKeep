import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { asId } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { mergeInvoiceDraft } from '@/features/service/invoiceDraft';
import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { extractInvoiceDraft } from '@/intelligence/pipeline';
import { mockExtractedDraft } from '@/mocks/serviceExtraction';
import { LoadingState, Screen } from '@/ui';

export const EXTRACT_DELAY_MS = 900;

/**
 * Document -> editable draft, then review. Never writes history. Demo mode uses the labeled mock
 * extraction; otherwise the M11 invoice pipeline runs through the configured OCR/extraction
 * ports. With no approved provider (G1) the draft stays for the user to fill from the invoice.
 */
export default function ExtractScreen() {
  const router = useRouter();
  const { draft, setDraft } = useServiceDraft();
  const { isDemoData } = useAppData();

  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) router.replace('/service/review');
    };
    if (isDemoData || !draft) {
      const t = setTimeout(() => {
        if (draft) setDraft(mockExtractedDraft(draft));
        done();
      }, EXTRACT_DELAY_MS);
      return () => clearTimeout(t);
    }
    const reader = onboardingServices()?.invoiceReader ?? null;
    const attachment = draft.attachment;
    void (async () => {
      if (!reader || !attachment) {
        setDraft({ ...draft, readingNote: 'unavailable' });
        return done();
      }
      const r = await extractInvoiceDraft(
        asId<'Vehicle'>(draft.vehicleId),
        {
          uri: attachment.file.uri,
          mimeType: attachment.file.mimeType,
          documentId: asId<'Document'>(attachment.documentId),
        },
        reader,
      );
      if (cancelled) return;
      setDraft(
        r.status === 'draft'
          ? mergeInvoiceDraft(draft, r.draft, r.uncertain, r.flags.length > 0)
          : { ...draft, readingNote: 'failed' },
      );
      done();
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount with the initial draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen
      testID="screen-service-extract"
      header={<ScreenHeader title={he.service.newTitle} />}
      scroll={false}
    >
      <LoadingState message={he.service.extracting} />
    </Screen>
  );
}
