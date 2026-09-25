import { AppHeader } from '@/features/shell/AppHeader';
import { he } from '@/i18n/he';
import { EmptyState, Screen } from '@/ui';

// T010 navigation-shell placeholder; the full screen is built in M02.
export default function DocumentsScreen() {
  return (
    <Screen header={<AppHeader />} edges={['top']} testID="screen-documents">
      <EmptyState icon="file-document-multiple-outline" title={he.tabs.documents} />
    </Screen>
  );
}
