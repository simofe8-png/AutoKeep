import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/PrototypeDataContext';
import type { ServiceEventVM } from '@/features/data/types';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Row,
  Screen,
  spacing,
  Stack,
  VerificationBadge,
} from '@/ui';

/** Chronological service history (T022). History ≠ manufacturer schedule. */
export default function HistoryScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { history, alerts } = useVehicleData(activeVehicle?.id ?? null);
  const alertCount = alerts.filter((a) => !a.handled).length;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} compact />}
      edges={['top']}
      testID="screen-history"
    >
      {sorted.length === 0 ? (
        <EmptyState
          testID="history-empty"
          icon="clipboard-text-clock-outline"
          title={he.history.empty}
          message={he.history.emptyBody}
          action={{
            label: he.history.add,
            icon: 'plus',
            onPress: () => router.push('/service/new'),
          }}
        />
      ) : (
        <>
          <Row>
            <AppText variant="title" accessibilityRole="header" style={styles.flex}>
              {he.history.title}
            </AppText>
            <Button
              testID="history-add"
              label={he.history.add}
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/service/new')}
            />
          </Row>
          <AppText variant="small" color="textMuted">
            {he.history.historyNotSchedule}
          </AppText>
          <Stack testID="history-list">
            {sorted.map((e) => (
              <HistoryCard key={e.id} event={e} onPress={() => router.push(`/service/${e.id}`)} />
            ))}
          </Stack>
        </>
      )}
    </Screen>
  );
}

function HistoryCard({ event, onPress }: { event: ServiceEventVM; onPress: () => void }) {
  const performed = event.actions.filter((a) => a.performed);
  return (
    <Card
      onPress={onPress}
      testID={`history-item-${event.id}`}
      accessibilityLabel={`${formatDate(event.date)}, ${formatKm(event.odometerKm)}, ${he.history.actions(performed.length)}`}
    >
      <Stack gap={spacing.xs}>
        <Row>
          <AppText variant="heading" style={styles.flex}>
            {formatDate(event.date)}
          </AppText>
          <AppText variant="bodyStrong" color="textSecondary">
            {formatKm(event.odometerKm)}
          </AppText>
        </Row>
        <AppText variant="small" color="textSecondary" numberOfLines={2}>
          {performed.map((a) => a.title).join(' · ')}
        </AppText>
        <Row style={styles.wrap}>
          <VerificationBadge state={event.verification} />
          <Badge label={he.authority[event.sourceAuthority]} tone="neutral" />
          {event.documentIds.length > 0 ? (
            <View style={styles.docs}>
              <Icon name="paperclip" size={16} color="textMuted" />
              <AppText variant="caption" color="textMuted">
                {event.documentIds.length}
              </AppText>
            </View>
          ) : null}
        </Row>
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
  docs: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
