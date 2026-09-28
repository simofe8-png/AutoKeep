import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { notificationScheduler } from '@/features/data/dataSource';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import {
  AppText,
  Card,
  InlineNotice,
  ListRow,
  Screen,
  SectionHeader,
  Stack,
  SwitchRow,
} from '@/ui';

/**
 * Settings (T027): manages behavior and reaches account/backup, notifications, vehicles,
 * documents, language, accessibility and about — without duplicating content screens.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const {
    account,
    network,
    setNetwork,
    isDemoData,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAppData();
  const [denied, setDenied] = useState(false);
  const scheduler = isDemoData ? null : notificationScheduler();
  const unavailable = !isDemoData && scheduler === null;

  // Opt-in only: the OS permission is requested when the user turns notifications on.
  const toggleNotifications = async (on: boolean) => {
    setDenied(false);
    if (!on) return setNotificationsEnabled(false);
    if (unavailable) return;
    if (scheduler && !(await scheduler.requestPermission())) return setDenied(true);
    setNotificationsEnabled(true);
  };

  return (
    <Screen header={<ScreenHeader title={he.settings.title} />} testID="screen-settings">
      <Card compact>
        <ListRow
          plainIcon
          testID="settings-account"
          icon="account-circle-outline"
          title={he.settings.profile}
          subtitle={account.hasAccount ? account.username : he.account.notBackedUp}
          onPress={() => router.push('/account')}
        />
      </Card>
      <Card compact>
        <ListRow
          plainIcon
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
          value={notificationsEnabled && !unavailable}
          onValueChange={(on) => void toggleNotifications(on)}
        />
        <AppText variant="caption" color="textMuted">
          {he.settings.notificationsHint}
        </AppText>
        {unavailable ? (
          <InlineNotice
            testID="settings-notifications-unavailable"
            tone="info"
            message={he.settings.notificationsUnavailable}
          />
        ) : null}
        {denied ? (
          <InlineNotice
            testID="settings-notifications-denied"
            tone="warning"
            message={he.settings.notificationsDenied}
          />
        ) : null}
      </Card>

      <Card compact>
        <ListRow
          plainIcon
          testID="settings-vehicles"
          icon="car-multiple"
          title={he.settings.vehicles}
          onPress={() => router.push('/vehicles')}
        />
      </Card>
      <Card compact>
        <ListRow
          plainIcon
          testID="settings-documents"
          icon="file-document-multiple-outline"
          title={he.settings.documents}
          onPress={() => router.navigate('/documents')}
        />
      </Card>

      <Card compact>
        <ListRow
          plainIcon
          icon="translate"
          title={he.settings.language}
          trailing={
            <AppText variant="bodyStrong" color="primary">
              {he.settings.languageValue}
            </AppText>
          }
        />
      </Card>
      <Card compact>
        <ListRow
          plainIcon
          icon="human"
          title={he.settings.accessibility}
          subtitle={he.settings.accessibilityValue}
        />
      </Card>
      <Card compact>
        <ListRow
          plainIcon
          icon="information-outline"
          title={he.settings.about}
          subtitle={he.settings.aboutValue}
        />
      </Card>

      {activeVehicle ? (
        <Card compact>
          <ListRow
            plainIcon
            danger
            testID="settings-delete-vehicle"
            icon="delete-outline"
            title={he.settings.deleteVehicle}
            subtitle={he.settings.deleteVehicleHint}
            onPress={() => router.push(`/vehicle/${activeVehicle.id}`)}
          />
        </Card>
      ) : null}

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
