import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { EmptyState, Screen } from '@/ui';

// T010 placeholder; built in T024.
export default function AlertsScreen() {
  return (
    <Screen header={<ScreenHeader title={he.header.alerts} />} testID="screen-alerts">
      <EmptyState icon="bell-outline" title={he.header.alerts} />
    </Screen>
  );
}
