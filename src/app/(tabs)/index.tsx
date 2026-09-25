import { AppHeader } from '@/features/shell/AppHeader';
import { he } from '@/i18n/he';
import { EmptyState, Screen } from '@/ui';

// T010 navigation-shell placeholder; the full screen is built in M02.
export default function HomeScreen() {
  return (
    <Screen header={<AppHeader />} edges={['top']} testID="screen-home">
      <EmptyState icon="home-outline" title={he.tabs.home} />
    </Screen>
  );
}
