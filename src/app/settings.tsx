import { useRouter } from 'expo-router';
import { useState } from 'react';

import { usePrototypeData } from '@/features/data/PrototypeDataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { Card, Divider, ListRow, Screen, SectionHeader, Stack, SwitchRow } from '@/ui';

/**
 * Settings (T027): manages behavior and reaches account/backup, notifications, vehicles,
 * documents, language, accessibility and about — without duplicating content screens.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { account, network, setNetwork, isDemoData } = usePrototypeData();
  const [notifications, setNotifications] = useState(true);

  return (
    <Screen header={<ScreenHeader title={he.settings.title} />} testID="screen-settings">
      <Card compact>
        <ListRow
          testID="settings-account"
          icon="account-circle-outline"
          title={he.settings.profile}
          subtitle={account.hasAccount ? account.email : he.account.notBackedUp}
          onPress={() => router.push('/account')}
        />
        <Divider />
        <ListRow
          testID="settings-backup"
          icon="cloud-sync-outline"
          title={he.settings.backup}
          subtitle={account.hasAccount ? he.account.connected : he.account.notBackedUp}
          onPress={() => router.push('/account')}
        />
      </Card>

      <Card compact>
        <SectionHeader title={he.settings.notifications} />
        <SwitchRow
          testID="settings-notifications"
          icon="bell-outline"
          label={he.settings.notificationsEnabled}
          value={notifications}
          onValueChange={setNotifications}
        />
      </Card>

      <Card compact>
        <ListRow
          testID="settings-vehicles"
          icon="car-multiple"
          title={he.settings.vehicles}
          onPress={() => router.push('/vehicles')}
        />
        <Divider />
        <ListRow
          testID="settings-documents"
          icon="file-document-multiple-outline"
          title={he.settings.documents}
          onPress={() => router.navigate('/documents')}
        />
      </Card>

      <Card compact>
        <ListRow
          icon="translate"
          title={he.settings.language}
          subtitle={he.settings.languageValue}
        />
        <Divider />
        <ListRow
          icon="human"
          title={he.settings.accessibility}
          subtitle={he.settings.accessibilityValue}
        />
        <Divider />
        <ListRow
          icon="information-outline"
          title={he.settings.about}
          subtitle={he.settings.aboutValue}
        />
      </Card>

      {isDemoData ? (
        <Stack testID="settings-demo">
          <SectionHeader title={he.settings.demoSection} />
          <Card compact tone="warning">
            <SwitchRow
              testID="settings-offline"
              icon="cloud-off-outline"
              label={he.settings.offlineMode}
              value={network === 'offline'}
              onValueChange={(v) => setNetwork(v ? 'offline' : 'online')}
            />
          </Card>
        </Stack>
      ) : null}
    </Screen>
  );
}
