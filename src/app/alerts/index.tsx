import { useRouter } from 'expo-router';

import { activeAlerts, AlertCard } from '@/features/alerts/components';
import { useVehicleData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { EmptyState, Screen, Stack } from '@/ui';

/** Alerts for the active vehicle (T024). Every alert identifies its vehicle and is explainable. */
export default function AlertsScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { alerts } = useVehicleData(activeVehicle?.id ?? null);
  const list = activeAlerts(alerts);

  return (
    <Screen header={<ScreenHeader title={he.alerts.title} />} testID="screen-alerts">
      {activeVehicle ? (
        <VehicleTargetBanner vehicle={activeVehicle} label={he.alerts.vehicle} />
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          icon="bell-check-outline"
          title={he.alerts.empty}
          message={he.alerts.emptyBody}
          testID="alerts-empty"
        />
      ) : (
        <Stack>
          {list.map((a) => (
            <AlertCard key={a.id} alert={a} onPress={() => router.push(`/alerts/${a.id}`)} />
          ))}
        </Stack>
      )}
    </Screen>
  );
}
