import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountOfferCard } from '@/features/account/AccountOfferCard';
import { activeAlerts, AlertStatusCard, mostUrgentAlert } from '@/features/alerts/components';
import { useAppData, useVehicleData } from '@/features/data/DataContext';
import { nextServiceTile } from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatNumber } from '@/features/vehicles/format';
import { VehiclePager } from '@/features/vehicles/VehiclePager';
import { VehicleHero } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  Button,
  EmptyState,
  OfflineBanner,
  QuickActionGrid,
  QuickActionTile,
  Screen,
  spacing,
  StatTile,
  StatusCard,
  TileRow,
  verificationLabel,
} from '@/ui';

/**
 * Home (T016), reproducing the approved Home reference — the LEFT screen of
 * docs/design/approved/a_clean_realistic_ui_ux_mockup_image_of_three_sma.png:
 * header · ONE active-vehicle card (image, name / spec / plate), swiped horizontally to switch
 * vehicles (owner decision 2026-09-29; "my vehicles" moved to the menu) · next service + odometer
 * tiles · the most urgent status card · "all alerts" · four shortcuts. Never claims the vehicle
 * is "healthy"; an unverified schedule is stated as such.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { activeVehicle, vehicles, setActiveVehicleId } = useActiveVehicle();
  const [switching, setSwitching] = useState(false);
  const { network, account } = useAppData();
  const data = useVehicleData(activeVehicle?.id ?? null);

  if (vehicles.length === 0) {
    // First use: straight into onboarding — no registration barrier.
    return <Redirect href="/onboarding" />;
  }
  if (!activeVehicle) {
    // All vehicles archived: no dead end — restore or add.
    return (
      <Screen header={<AppHeader />} edges={['top']} testID="screen-home">
        <EmptyState
          icon="archive-outline"
          title={he.activeVehicle.noVehicle}
          action={{ label: he.myVehicles.add, onPress: () => router.push('/onboarding') }}
          secondaryAction={{
            label: he.myVehicles.archived,
            onPress: () => router.push('/vehicles'),
          }}
        />
      </Screen>
    );
  }

  const alerts = activeAlerts(data.alerts);
  const urgent = mostUrgentAlert(alerts);
  const { schedule } = data;
  const hasValuableData = data.history.length > 0 || data.documents.length > 0;
  const tile =
    schedule.status === 'verified' && schedule.next ? nextServiceTile(schedule.next) : null;

  return (
    <Screen header={<AppHeader alertCount={alerts.length} />} edges={['top']} testID="screen-home">
      {network === 'offline' ? <OfflineBanner /> : null}

      <VehiclePager
        vehicles={vehicles.filter((v) => !v.archived)}
        activeId={activeVehicle.id}
        onSelect={setActiveVehicleId}
        onMovingChange={setSwitching}
        renderCard={(v) => <VehicleHero vehicle={v} />}
      />

      {/* Vehicle-scoped data: hidden while a card is being swiped, so one vehicle's card is never
          shown with another vehicle's data; keyed so it re-renders for the new vehicle at once. */}
      <View
        key={activeVehicle.id}
        testID="home-vehicle-data"
        style={[styles.body, switching && styles.hidden]}
        importantForAccessibility={switching ? 'no-hide-descendants' : 'auto'}
      >
        <TileRow testID="home-status-card">
          <StatTile
            testID="home-next-service"
            icon="calendar-month-outline"
            label={he.home.nextService}
            value={tile ? tile.value : verificationLabel(schedule.status)}
            detail={tile?.detail}
            onPress={() => router.push('/maintenance')}
          />
          <StatTile
            testID="home-odometer-card"
            icon="road-variant"
            label={he.home.odometerNow}
            value={formatNumber(activeVehicle.odometerKm)}
            detail={he.common.km}
            onPress={() => router.push('/odometer')}
            accessibilityHint={he.home.updateOdometer}
          />
        </TileRow>

        {urgent ? (
          <AlertStatusCard
            alert={urgent}
            testID="home-alerts"
            onPress={() => router.push(`/alerts/${urgent.id}`)}
          />
        ) : schedule.status !== 'verified' ? (
          <StatusCard
            testID="schedule-unavailable"
            tone={schedule.status === 'pending' ? 'warning' : 'neutral'}
            icon={schedule.status === 'pending' ? 'clock-outline' : 'information-variant'}
            title={he.home.scheduleUnavailableTitle}
            subtitle={verificationLabel(schedule.status)}
            onPress={() => router.push('/maintenance')}
          />
        ) : !schedule.next ? (
          <StatusCard
            testID="home-no-tasks"
            tone="success"
            icon="check"
            title={he.home.noTasks}
            subtitle={he.home.noTasksBody}
          />
        ) : null}

        <Button
          testID="home-all-alerts"
          label={he.home.allAlertsCount(alerts.length)}
          icon="bell-outline"
          fullWidth
          onPress={() => router.push('/alerts')}
        />

        <QuickActionGrid testID="home-shortcuts">
          <QuickActionTile
            testID="home-garage-mode"
            icon="car-wrench"
            label={he.home.garageMode}
            onPress={() => router.push('/garage')}
          />
          <QuickActionTile
            testID="home-history"
            icon="clock-outline"
            label={he.history.title}
            onPress={() => router.push('/history')}
          />
          <QuickActionTile
            testID="home-documents"
            icon="file-document-outline"
            label={he.documents.title}
            onPress={() => router.push('/documents')}
          />
          <QuickActionTile
            testID="home-view-service"
            icon="wrench-outline"
            label={he.home.plan}
            onPress={() => router.push('/maintenance')}
          />
        </QuickActionGrid>

        {!account.hasAccount && hasValuableData ? (
          <AccountOfferCard onPress={() => router.push('/account')} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  hidden: { opacity: 0 },
});
