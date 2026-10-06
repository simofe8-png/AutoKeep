import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useVehicleData } from '@/features/data/DataContext';
import { PeriodicSection } from '@/features/maintenance/table/PeriodicSection';
import { TableSection } from '@/features/maintenance/table/TableSection';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { PlanVehicleCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import { EmptyState, Screen, SegmentedControl } from '@/ui';

type Tab = 'table' | 'periodic';

/**
 * Maintenance (owner decision 2026-10-06): two screens. "לוח טיפולים" — the owner's table exactly
 * as the booklet builds it; "טיפול תקופתי" — the next service and the one after, derived from it by
 * the odometer or the time since the last service. Replaces the earlier plan screen.
 */
export default function MaintenanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; new?: string }>();
  const { activeVehicle } = useActiveVehicle();
  const data = useVehicleData(activeVehicle?.id ?? null);
  const vm = data.serviceTable ?? null;
  const approved = vm?.status === 'confirmed';
  const [tab, setTab] = useState<Tab>(
    params.tab === 'table' || params.tab === 'periodic'
      ? params.tab
      : approved
        ? 'periodic'
        : 'table',
  );
  // A link to a given tab (e.g. from the profile window) selects it again when it changes.
  const [linked, setLinked] = useState(params.tab);
  if (params.tab !== linked) {
    setLinked(params.tab);
    if (params.tab === 'table' || params.tab === 'periodic') setTab(params.tab);
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title={he.tabs.maintenance}
          brand
          backLabel={he.common.back}
          onBack={() => router.navigate('/')}
        />
      }
      edges={['top']}
      testID="screen-maintenance"
    >
      {activeVehicle ? (
        <>
          <PlanVehicleCard vehicle={activeVehicle} onPress={() => router.push('/vehicles')} />
          <SegmentedControl<Tab>
            testID="maintenance-tabs"
            accessibilityLabel={he.tabs.maintenance}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'table', label: he.serviceTable.tabs.table },
              { value: 'periodic', label: he.serviceTable.tabs.periodic },
            ]}
          />
          {tab === 'table' ? (
            <TableSection
              key={activeVehicle.id}
              vehicleId={activeVehicle.id}
              vm={vm}
              offer={data.serviceTableOffer === true}
              newTable={params.new === '1'}
              onApproved={() => setTab('periodic')}
            />
          ) : (
            <PeriodicSection
              key={activeVehicle.id}
              vehicleId={activeVehicle.id}
              odometerKm={activeVehicle.odometerKm}
              spec={activeVehicle.spec}
              vm={vm}
              onToTable={() => setTab('table')}
            />
          )}
        </>
      ) : (
        <EmptyState icon="car-off" title={he.activeVehicle.noVehicle} />
      )}
    </Screen>
  );
}
