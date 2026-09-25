import { StyleSheet, View } from 'react-native';

import type { VehicleDataBundle } from '@/features/data/types';
import { DueStatusBadge } from '@/features/maintenance/components';
import { he } from '@/i18n/he';
import { AppText, Badge, Button, Card, Icon, Row, spacing, VerificationBadge } from '@/ui';

import { vehicleKindIcon } from './ActiveVehicleBar';
import { formatKm } from './format';
import { vehicleDisplayName, type VehicleSummary } from './types';

/** Most important maintenance state for the card: due status, or schedule verification state. */
function VehicleStatus({ bundle }: { bundle: VehicleDataBundle }) {
  if (bundle.schedule.status === 'verified' && bundle.schedule.next) {
    return <DueStatusBadge status={bundle.schedule.next.status} />;
  }
  return <VerificationBadge state={bundle.schedule.status} />;
}

export function VehicleCard({
  vehicle,
  bundle,
  active,
  onSelect,
  onManage,
}: {
  vehicle: VehicleSummary;
  bundle: VehicleDataBundle;
  active: boolean;
  onSelect?: () => void;
  onManage: () => void;
}) {
  const nextTitle = bundle.schedule.next?.title;
  const alertCount = bundle.alerts.filter((a) => !a.handled).length;
  return (
    <Card
      tone={active ? 'highlight' : vehicle.archived ? 'muted' : 'default'}
      testID={`vehicle-card-${vehicle.id}`}
    >
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={vehicleKindIcon[vehicle.kind]} size={26} color="primary" />
        </View>
        <View style={styles.text}>
          <Row style={styles.wrap}>
            <AppText variant="heading">{vehicleDisplayName(vehicle)}</AppText>
            {active ? (
              <Badge label={he.activeVehicle.activeBadge} tone="info" icon="check" />
            ) : null}
            {vehicle.archived ? <Badge label={he.lifecycle.archivedBadge} tone="neutral" /> : null}
          </Row>
          <AppText variant="small" color="textSecondary">
            {he.vehicleType[vehicle.kind]} · {vehicle.registration} · {formatKm(vehicle.odometerKm)}
          </AppText>
          <Row style={styles.wrap}>
            <VehicleStatus bundle={bundle} />
            {nextTitle ? (
              <AppText variant="small" color="textMuted">
                {nextTitle}
              </AppText>
            ) : null}
            {alertCount > 0 ? (
              <Badge
                label={`${he.alerts.title}: ${alertCount}`}
                tone="warning"
                icon="bell-outline"
              />
            ) : null}
          </Row>
        </View>
      </View>
      <Row gap={spacing.sm} style={styles.actions}>
        {onSelect && !active ? (
          <Button
            testID={`vehicle-select-${vehicle.id}`}
            label={he.activeVehicle.switch}
            onPress={onSelect}
            accessibilityLabel={`${he.activeVehicle.switch}: ${vehicleDisplayName(vehicle)}`}
          />
        ) : null}
        <Button
          testID={`vehicle-manage-${vehicle.id}`}
          label={he.myVehicles.manage}
          variant="secondary"
          icon="cog-outline"
          onPress={onManage}
          accessibilityLabel={`${he.myVehicles.manage}: ${vehicleDisplayName(vehicle)}`}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  wrap: { flexWrap: 'wrap' },
  actions: { marginTop: spacing.md, flexWrap: 'wrap' },
});
