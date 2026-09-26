import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { alertTone } from '@/features/alerts/components';
import { useAppData } from '@/features/data/DataContext';
import type { AlertVM } from '@/features/data/types';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  type ButtonProps,
} from '@/ui';

/**
 * Alert detail (T024): why it exists, its data basis, the vehicle, last completion, and the
 * relevant actions. Opening an alert (e.g. from a notification deep link) switches the active
 * context to the alert's own vehicle.
 */
export default function AlertDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle, setAlertHandled } = useAppData();
  const { activeVehicleId, setActiveVehicleId } = useActiveVehicle();

  const owner = vehicles.find((v) => getBundle(v.id).alerts.some((a) => a.id === id));
  const alert = owner ? getBundle(owner.id).alerts.find((a) => a.id === id) : undefined;

  useEffect(() => {
    if (owner && owner.id !== activeVehicleId && !owner.archived) setActiveVehicleId(owner.id);
  }, [owner, activeVehicleId, setActiveVehicleId]);

  if (!owner || !alert) {
    return (
      <Screen header={<ScreenHeader title={he.alerts.title} />}>
        <EmptyState icon="bell-off-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  const actions = alertActions(alert, router);

  return (
    <Screen
      testID="screen-alert-detail"
      header={<ScreenHeader title={he.alerts.kinds[alert.kind]} />}
    >
      <VehicleTargetBanner vehicle={owner} label={he.alerts.vehicle} />
      <Card>
        <Stack gap={spacing.sm}>
          <Badge
            label={alert.handled ? he.alerts.handled : he.alerts.kinds[alert.kind]}
            tone={alert.handled ? 'success' : alertTone[alert.kind]}
          />
          <AppText variant="title">{alert.title}</AppText>
        </Stack>
      </Card>
      <Card testID="alert-why">
        <SectionHeader title={he.alerts.why} />
        <AppText>{alert.reason}</AppText>
      </Card>
      <Card testID="alert-basis">
        <SectionHeader title={he.alerts.basis} />
        <AppText color="textSecondary">{alert.basis}</AppText>
      </Card>
      {alert.lastCompletion ? (
        <Card testID="alert-last-completion">
          <SectionHeader title={he.alerts.lastCompletion} />
          <AppText color="textSecondary">{alert.lastCompletion}</AppText>
        </Card>
      ) : null}
      {!alert.handled ? (
        <Stack gap={spacing.sm}>
          {actions.map((a) => (
            <Button key={a.label} {...a} fullWidth />
          ))}
          <Button
            testID="alert-mark-handled"
            label={he.alerts.markHandled}
            variant="ghost"
            fullWidth
            onPress={() => {
              setAlertHandled(owner.id, alert.id);
              router.back();
            }}
          />
        </Stack>
      ) : null}
    </Screen>
  );
}

function alertActions(alert: AlertVM, router: ReturnType<typeof useRouter>): ButtonProps[] {
  const record: ButtonProps = {
    testID: 'alert-record-service',
    label: he.alerts.recordHandled,
    icon: 'clipboard-check-outline',
    onPress: () =>
      router.push(
        alert.maintenanceItemId ? `/service/new?item=${alert.maintenanceItemId}` : '/service/new',
      ),
  };
  switch (alert.kind) {
    case 'upcoming':
    case 'overdue':
      return [
        {
          testID: 'alert-view-service',
          label: he.alerts.viewService,
          icon: 'format-list-checks',
          onPress: () => router.push('/maintenance'),
        },
        { ...record, variant: 'secondary' },
      ];
    case 'stale_odometer':
      return [
        {
          testID: 'alert-update-odometer',
          label: he.alerts.updateOdometer,
          icon: 'speedometer',
          onPress: () => router.push('/odometer'),
        },
      ];
    case 'deferred':
      return [record];
  }
}
