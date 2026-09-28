import { Redirect, useRouter } from 'expo-router';

import { AccountOfferCard } from '@/features/account/AccountOfferCard';
import { activeAlerts, AlertStatusCard, mostUrgentAlert } from '@/features/alerts/components';
import { useAppData, useVehicleData } from '@/features/data/DataContext';
import { nextServiceTile, ScheduleUnavailable } from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm } from '@/features/vehicles/format';
import { VehicleHero, VehicleSelectorCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  Button,
  Card,
  EmptyState,
  InlineNotice,
  OfflineBanner,
  QuickActionGrid,
  QuickActionTile,
  Screen,
  StatTile,
  StatusCard,
  TileRow,
  verificationLabel,
} from '@/ui';

/**
 * Home (T016), laid out after the approved Home reference (left variant of
 * docs/design/approved/a_clean_realistic_ui_ux_mockup_image_of_three_sma.png): active vehicle,
 * next service and odometer, the most urgent alert, all alerts, shortcuts. Never claims the
 * vehicle is "healthy"; unverified schedules stay unavailable.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { activeVehicle, vehicles } = useActiveVehicle();
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

      <VehicleSelectorCard vehicle={activeVehicle} onPress={() => router.push('/vehicles')} />
      <VehicleHero vehicle={activeVehicle} />

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
          value={formatKm(activeVehicle.odometerKm)}
          detail={`${he.home.measuredAt}: ${formatDate(activeVehicle.odometerMeasuredAt)}`}
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
      ) : null}

      {schedule.status !== 'verified' ? (
        <Card tone={schedule.status === 'pending' ? 'warning' : 'muted'}>
          <ScheduleUnavailable
            schedule={schedule}
            onUploadManual={() => router.push('/documents')}
          />
        </Card>
      ) : !schedule.next ? (
        <StatusCard
          testID="home-no-tasks"
          tone="success"
          icon="check"
          title={he.home.noTasks}
          subtitle={he.home.noTasksBody}
        />
      ) : null}

      {alerts.length > 0 ? (
        <Button
          testID="home-all-alerts"
          label={he.home.allAlertsCount(alerts.length)}
          icon="bell-outline"
          fullWidth
          onPress={() => router.push('/alerts')}
        />
      ) : null}

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

      <Button
        testID="home-record-service"
        label={he.home.recordService}
        icon="plus-circle-outline"
        variant="secondary"
        fullWidth
        onPress={() => router.push('/service/new')}
      />

      {!account.hasAccount && hasValuableData ? (
        <AccountOfferCard onPress={() => router.push('/account')} />
      ) : null}

      {network === 'offline' && schedule.status !== 'verified' ? (
        <InlineNotice tone="neutral" message={he.states.offlineMessage} />
      ) : null}
    </Screen>
  );
}
