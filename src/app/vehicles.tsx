import { useRouter } from 'expo-router';

import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { vehicleKindIcon } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatKm } from '@/features/vehicles/format';
import { vehicleDisplayName } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import { Badge, Card, ListRow, Screen, spacing, Stack } from '@/ui';

// T011 switcher; expanded into the full "כלי הרכב שלי" screen in T025.
export default function VehiclesScreen() {
  const router = useRouter();
  const { vehicles, activeVehicleId, setActiveVehicleId } = useActiveVehicle();
  const selectable = vehicles.filter((v) => !v.archived);

  return (
    <Screen header={<ScreenHeader title={he.vehicles.title} closeIcon />} testID="screen-vehicles">
      <Stack>
        {selectable.map((v) => {
          const active = v.id === activeVehicleId;
          return (
            <Card
              key={v.id}
              tone={active ? 'highlight' : 'default'}
              padded={false}
              style={{ paddingHorizontal: spacing.md }}
            >
              <ListRow
                testID={`vehicle-row-${v.id}`}
                icon={vehicleKindIcon[v.kind]}
                title={vehicleDisplayName(v)}
                subtitle={`${he.vehicleType[v.kind]} · ${v.registration} · ${formatKm(v.odometerKm)}`}
                trailing={
                  active ? <Badge label={he.activeVehicle.activeBadge} tone="info" /> : undefined
                }
                showChevron={!active}
                accessibilityLabel={`${vehicleDisplayName(v)}, ${v.registration}${active ? `, ${he.activeVehicle.activeBadge}` : ''}`}
                onPress={() => {
                  setActiveVehicleId(v.id);
                  router.back();
                }}
              />
            </Card>
          );
        })}
      </Stack>
    </Screen>
  );
}
