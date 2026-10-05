import { useRouter } from 'expo-router';

import { ManualScheduleTable } from '@/features/maintenance/ManualScheduleTable';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { Screen } from '@/ui';

/** "לוח טיפולים תקופתי" as a screen (from the Maintenance tab). */
export default function MaintenanceTableScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  if (!activeVehicle) return null;
  return (
    <Screen
      testID="screen-maintenance-table"
      header={<ScreenHeader title={he.manualItem.tableTitle} />}
    >
      <ManualScheduleTable vehicleId={activeVehicle.id} onSaved={() => router.back()} />
    </Screen>
  );
}
