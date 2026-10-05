import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAppData, useVehicleData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { profileCompletion } from '@/features/vehicles/profileCompletion';
import { ProfileCompletionCard } from '@/features/vehicles/ProfileCompletionCard';
import { he } from '@/i18n/he';
import { Button, Screen } from '@/ui';

/**
 * "השלמת פרופיל הרכב" as a screen (owner decision 2026-10-05): shown right after a vehicle is
 * added, and from the Home "missing" note. The title is at the top; every item opens its window.
 */
export default function VehicleProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, vehiclePhotos } = useAppData();
  const data = useVehicleData(id ?? null);
  const vehicle = vehicles.find((v) => v.id === id);
  if (!vehicle) return null;
  const completion = profileCompletion(vehicle, {
    hasSchedule: data.schedule.status === 'verified' || (data.plan?.items.length ?? 0) > 0,
    hasPhoto: Boolean(vehiclePhotos[vehicle.id]),
  });
  return (
    <Screen
      testID="screen-vehicle-profile"
      header={<ScreenHeader title={he.profile.title} />}
      footer={
        <Button
          testID="profile-screen-continue"
          label={he.profile.screenContinue}
          icon="home-outline"
          fullWidth
          onPress={() => router.dismissTo('/')}
        />
      }
    >
      <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />
      <ProfileCompletionCard vehicle={vehicle} completion={completion} showTitle={false} />
    </Screen>
  );
}
