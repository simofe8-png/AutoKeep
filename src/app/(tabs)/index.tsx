import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountOfferCard } from '@/features/account/AccountOfferCard';
import { activeAlerts, AlertStatusCard, mostUrgentAlert } from '@/features/alerts/components';
import { useAppData, useVehicleData } from '@/features/data/DataContext';
import { nextServiceTile } from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, formatNumber } from '@/features/vehicles/format';
import { VehiclePager } from '@/features/vehicles/VehiclePager';
import { profileCompletion } from '@/features/vehicles/profileCompletion';
import { ProfileCompletionCard, ProfileDoneCard } from '@/features/vehicles/ProfileCompletionCard';
import { VehicleHero } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  Button,
  EmptyState,
  OfflineBanner,
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
  const { network, account, vehiclePhotos, profileCard, setProfileCard } = useAppData();
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
  const completion = profileCompletion(activeVehicle, {
    hasSchedule: data.schedule.status === 'verified' || (data.plan?.items.length ?? 0) > 0,
    hasPhoto: Boolean(vehiclePhotos[activeVehicle.id]),
  });
  const cardState = profileCard[activeVehicle.id];
  const urgent = mostUrgentAlert(alerts);
  const { schedule } = data;
  const hasValuableData = data.history.length > 0 || data.documents.length > 0;
  const tile =
    schedule.status === 'verified' && schedule.next ? nextServiceTile(schedule.next) : null;
  // Without a curated schedule, the evidence-based plan decides (never an invented interval).
  const plan = schedule.status !== 'verified' ? data.plan : undefined;
  const planNext = plan?.next[0];
  const planTile = planNext
    ? {
        value: plan!.next.map((n) => n.title).join(', '),
        detail: planNext.nextDate
          ? formatDate(planNext.nextDate)
          : planNext.nextKm != null
            ? formatKm(planNext.nextKm)
            : undefined,
      }
    : null;

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
            value={
              tile
                ? tile.value
                : planTile
                  ? planTile.value
                  : plan
                    ? he.home.needInfoShort
                    : verificationLabel(schedule.status)
            }
            detail={tile?.detail ?? planTile?.detail}
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

        {!completion.complete && cardState !== 'hidden' ? (
          <ProfileCompletionCard
            vehicle={activeVehicle}
            completion={completion}
            onHide={() => setProfileCard(activeVehicle.id, 'hidden')}
          />
        ) : completion.complete && cardState !== 'done' ? (
          <ProfileDoneCard onClose={() => setProfileCard(activeVehicle.id, 'done')} />
        ) : !completion.complete ? (
          // The card is hidden but something required is missing: a short note to complete it.
          <StatusCard
            testID="profile-missing"
            tone="warning"
            icon="clipboard-alert-outline"
            title={he.profile.missingTitle(
              completion.items
                .filter((i) => i.required && !i.done)
                .map((i) => he.profile.items[i.key].title)
                .join(', '),
            )}
            subtitle={he.profile.missingAction}
            onPress={() => router.push(`/vehicle/${activeVehicle.id}/profile`)}
          />
        ) : null}

        {urgent ? (
          <AlertStatusCard
            alert={urgent}
            testID="home-alerts"
            onPress={() => router.push(`/alerts/${urgent.id}`)}
          />
        ) : plan ? null : schedule.status !== 'verified' ? (
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

        {/* History, documents and the plan are in the tab bar (owner decision 2026-10-04: no
            duplicate shortcuts); garage mode has no tab. */}
        <Button
          testID="home-garage-mode"
          label={he.home.garageMode}
          icon="car-wrench"
          variant="secondary"
          fullWidth
          onPress={() => router.push('/garage')}
        />

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
