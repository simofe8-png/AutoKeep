import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useServiceDraft } from '@/features/service/ServiceDraftContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { mockExtractedDraft } from '@/mocks/serviceExtraction';
import { LoadingState, Screen } from '@/ui';

export const EXTRACT_DELAY_MS = 900;

/** Simulated document extraction → draft only, then review. Never writes history. */
export default function ExtractScreen() {
  const router = useRouter();
  const { draft, setDraft } = useServiceDraft();

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft) setDraft(mockExtractedDraft(draft));
      router.replace('/service/review');
    }, EXTRACT_DELAY_MS);
    return () => clearTimeout(t);
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
