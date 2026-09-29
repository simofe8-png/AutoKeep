import { useRouter } from 'expo-router';

import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { VehicleCard } from '@/features/vehicles/VehicleCard';
import { he } from '@/i18n/he';
import { Button, IconButton, Screen, SectionHeader, Stack } from '@/ui';

/**
 * כלי הרכב שלי (T025): identity, odometer and important status per vehicle; the active one is
 * clearly marked. Selecting changes context only. Adding reuses onboarding.
 */
export default function VehiclesScreen() {
  const router = useRouter();
  const { getBundle } = useAppData();
  const { vehicles, activeVehicleId, setActiveVehicleId } = useActiveVehicle();
  const current = vehicles.filter((v) => !v.archived);
  const archived = vehicles.filter((v) => v.archived);

  return (
    <Screen
      header={
        <ScreenHeader
          title={he.vehicles.title}
          subtitle={he.myVehicles.subtitle}
          trailing={
            <IconButton
              testID="vehicles-add-header"
              icon="plus"
              accessibilityLabel={he.myVehicles.add}
              onPress={() => router.push('/onboarding')}
            />
          }
        />
      }
      testID="screen-vehicles"
      footer={
        <Button
          testID="vehicles-add"
          label={he.myVehicles.add}
          icon="plus"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/onboarding')}
        />
      }
    >
      <Stack>
        {current.map((v) => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            bundle={getBundle(v.id)}
            active={v.id === activeVehicleId}
            onSelect={() => {
              setActiveVehicleId(v.id);
              // Reached from the menu: choosing a vehicle lands on its Home.
              router.dismissTo('/');
            }}
            onManage={() => router.push(`/vehicle/${v.id}`)}
          />
        ))}
      </Stack>

      {archived.length > 0 ? (
        <Stack testID="vehicles-archived">
          <SectionHeader title={he.myVehicles.archived} />
          {archived.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              bundle={getBundle(v.id)}
              active={false}
              onManage={() => router.push(`/vehicle/${v.id}`)}
            />
          ))}
        </Stack>
      ) : null}
    </Screen>
  );
}
