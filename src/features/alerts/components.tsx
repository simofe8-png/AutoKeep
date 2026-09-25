import { StyleSheet, View } from 'react-native';

import type { AlertKind, AlertVM } from '@/features/data/types';
import { he } from '@/i18n/he';
import { AppText, Badge, Card, Icon, spacing, type BadgeTone, type IconName } from '@/ui';

export const alertTone: Record<AlertKind, BadgeTone> = {
  upcoming: 'warning',
  overdue: 'danger',
  deferred: 'info',
  stale_odometer: 'neutral',
};

export const alertIcon: Record<AlertKind, IconName> = {
  upcoming: 'calendar-clock',
  overdue: 'calendar-alert',
  deferred: 'timer-sand',
  stale_odometer: 'speedometer',
};

const cardTone = {
  upcoming: 'warning',
  overdue: 'danger',
  deferred: 'default',
  stale_odometer: 'muted',
} as const;

export function activeAlerts(alerts: AlertVM[]): AlertVM[] {
  return alerts.filter((a) => !a.handled);
}

export function AlertCard({ alert, onPress }: { alert: AlertVM; onPress: () => void }) {
  return (
    <Card
      tone={cardTone[alert.kind]}
      onPress={onPress}
      accessibilityLabel={`${he.alerts.kinds[alert.kind]}: ${alert.title}`}
      testID={`alert-card-${alert.id}`}
    >
      <View style={styles.row}>
        <Icon
          name={alertIcon[alert.kind]}
          size={24}
          color={alertTone[alert.kind] === 'danger' ? 'danger' : 'textSecondary'}
        />
        <View style={styles.text}>
          <Badge label={he.alerts.kinds[alert.kind]} tone={alertTone[alert.kind]} />
          <AppText variant="bodyStrong">{alert.title}</AppText>
          <AppText variant="small" color="textSecondary" numberOfLines={2}>
            {alert.reason}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  text: { flex: 1, gap: spacing.xs },
});
