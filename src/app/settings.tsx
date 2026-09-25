import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { EmptyState, Screen } from '@/ui';

// T010 placeholder; built in T027.
export default function SettingsScreen() {
  return (
    <Screen header={<ScreenHeader title={he.header.settings} />} testID="screen-settings">
      <EmptyState icon="cog-outline" title={he.header.settings} />
    </Screen>
  );
}
