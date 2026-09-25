import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccountOfferCard } from '@/features/account/AccountOfferCard';
import { activeAlerts, AlertCard } from '@/features/alerts/components';
import { usePrototypeData, useVehicleData } from '@/features/data/PrototypeDataContext';
import { NextServiceSummary, ScheduleUnavailable } from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  InlineNotice,
  OfflineBanner,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
} from '@/ui';

/**
 * Home (T016): which vehicle is active, maintenance status, what is next, when, and whether the
 * user needs to act. Never claims the vehicle is "healthy".
 */
export default function HomeScreen() {
  const router = useRouter();
  const { activeVehicle, vehicles } = useActiveVehicle();
  const { network, account } = usePrototypeData();
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
  const { schedule } = data;
  const hasValuableData = data.history.length > 0 || data.documents.length > 0;

  return (
    <Screen header={<AppHeader alertCount={alerts.length} />} edges={['top']} testID="screen-home">
      {network === 'offline' ? <OfflineBanner /> : null}

      <Card testID="home-status-card">
        {schedule.status === 'verified' && schedule.next ? (
          <Stack>
            <AppText variant="small" color="textMuted">
              {he.home.nextService}
            </AppText>
            <NextServiceSummary next={schedule.next} />
            <Row gap={spacing.sm} style={styles.wrap}>
              <Button
                testID="home-view-service"
                label={he.home.viewService}
                icon="format-list-checks"
                onPress={() => router.push('/maintenance')}
              />
              <Button
                testID="home-garage-mode"
                label={he.home.garageMode}
                icon="garage-variant"
                variant="secondary"
                onPress={() => router.push('/garage')}
              />
            </Row>
          </Stack>
        ) : schedule.status === 'verified' ? (
          <Stack testID="home-no-tasks">
            <Row>
              <Icon name="check-circle-outline" size={24} color="success" />
              <AppText variant="heading" style={styles.flex}>
                {he.home.noTasks}
              </AppText>
            </Row>
            <AppText variant="small" color="textSecondary">
              {he.home.noTasksBody}
            </AppText>
          </Stack>
        ) : (
          <ScheduleUnavailable
            schedule={schedule}
            onUploadManual={() => router.push('/documents')}
          />
        )}
      </Card>

      <Card testID="home-odometer-card">
        <Row>
          <Icon name="speedometer" size={24} color="primary" />
          <View style={styles.flex}>
            <AppText variant="small" color="textMuted">
              {he.home.odometerTitle}
            </AppText>
            <AppText variant="heading">{formatKm(activeVehicle.odometerKm)}</AppText>
            <AppText variant="caption" color="textMuted">
              {he.home.measuredAt}: {formatDate(activeVehicle.odometerMeasuredAt)}
            </AppText>
          </View>
          <Button
            testID="home-update-odometer"
            label={he.home.updateOdometer}
            variant="ghost"
            onPress={() => router.push('/odometer')}
          />
        </Row>
      </Card>

      {alerts.length > 0 ? (
        <Stack testID="home-alerts">
          <SectionHeader
            title={he.home.alertsTitle}
            action={
              <Button
                label={he.home.allAlerts}
                variant="ghost"
                onPress={() => router.push('/alerts')}
              />
            }
          />
          {alerts.slice(0, 2).map((a) => (
            <AlertCard key={a.id} alert={a} onPress={() => router.push(`/alerts/${a.id}`)} />
          ))}
        </Stack>
      ) : null}

      <Button
        testID="home-record-service"
        label={he.home.recordService}
        icon="plus-circle-outline"
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
});
