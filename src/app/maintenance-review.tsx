import { useVehicleData } from '@/features/data/DataContext';
import { OwnerReviewList } from '@/features/maintenance/OwnerReview';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { Screen } from '@/ui';

/** Owner review of items read from the owner's own document (active vehicle only). */
export default function MaintenanceReviewScreen() {
  const { activeVehicle } = useActiveVehicle();
  const { plan } = useVehicleData(activeVehicle?.id ?? null);
  return (
    <Screen
      testID="screen-maintenance-review"
      header={<ScreenHeader title={he.maintenancePlan.ownerReview.screenTitle} />}
    >
      {activeVehicle ? (
        <OwnerReviewList
          proposals={plan?.ownerReview?.proposals ?? []}
          vehicleId={activeVehicle.id}
        />
      ) : null}
    </Screen>
  );
}
