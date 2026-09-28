import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useVehicleData } from '@/features/data/DataContext';
import {
  MaintenanceItemList,
  NextServiceSummary,
  ScheduleUnavailable,
  SourceLine,
} from '@/features/maintenance/components';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts } from '@/features/vehicles/format';
import { VehicleContextCard } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  FilterChips,
  IconCircle,
  ListRow,
  Screen,
  spacing,
  Stack,
  TimelineItem,
} from '@/ui';

type Tab = 'included' | 'info' | 'history';

/**
 * Next-service detail (approved reference "פרטי טיפול"): what the service includes — the
 * manufacturer requirements, each expanding in place with instruction, action type and exact
 * evidence — then garage recommendations kept apart as "not mandatory". No AI recommendations
 * (owner decision 2026-09-28: AI is not an authoritative maintenance source).
 */
export default function NextServiceScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { schedule, history, garageRecommendations } = useVehicleData(activeVehicle?.id ?? null);
  const [tab, setTab] = useState<Tab>('included');
  const next = schedule.status === 'verified' ? schedule.next : undefined;
  const openSource = (documentId: string, locator?: string) =>
    router.push(
      `/documents/${documentId}${locator ? `?locator=${encodeURIComponent(locator)}` : ''}`,
    );

  return (
    <Screen
      testID="screen-next-service"
      header={<ScreenHeader title={he.maintenance.detailTitle} />}
      footer={
        next ? (
          <View style={styles.footerRow}>
            <Button
              testID="maintenance-garage-mode"
              label={he.home.garageMode}
              icon="car-wrench"
              variant="secondary"
              style={styles.flex}
              onPress={() => router.push('/garage')}
            />
            <Button
              testID="maintenance-record-service"
              label={he.home.recordService}
              icon="plus-circle-outline"
              style={styles.flex}
              onPress={() => router.push('/service/new')}
            />
          </View>
        ) : undefined
      }
    >
      {activeVehicle ? <VehicleContextCard vehicle={activeVehicle} /> : null}
      {!next ? (
        schedule.status !== 'verified' ? (
          <ScheduleUnavailable
            schedule={schedule}
            onUploadManual={() => router.push('/documents')}
          />
        ) : (
          <EmptyState
            icon="check-circle-outline"
            title={he.home.noTasks}
            message={he.home.noTasksBody}
          />
        )
      ) : (
        <>
          <Card>
            <NextServiceSummary next={next} />
          </Card>
          <FilterChips
            testID="next-service-tabs"
            accessibilityLabel={he.maintenance.detailTitle}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'included', label: he.maintenance.tabs.included },
              { value: 'info', label: he.maintenance.tabs.info },
              { value: 'history', label: he.maintenance.tabs.history },
            ]}
          />

          {tab === 'included' ? (
            <>
              <Card tone="tint" testID="next-service-manufacturer">
                <Stack gap={spacing.xs}>
                  <View style={styles.groupHead}>
                    <IconCircle icon="factory" tone="info" size={40} />
                    <View style={styles.flex}>
                      <AppText variant="heading" color="primary">
                        {he.maintenance.manufacturerReqs}
                      </AppText>
                      {schedule.source ? (
                        <AppText variant="small" color="textSecondary">
                          {`${he.maintenance.source}: ${schedule.source.sourceTitle}`}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                  <AppText variant="small" color="textMuted">
                    {he.maintenance.expandHint}
                  </AppText>
                  <MaintenanceItemList items={next.items} onOpenSource={openSource} />
                </Stack>
              </Card>
              {garageRecommendations.length > 0 ? (
                <Card tone="warning" testID="next-service-garage">
                  <Stack gap={spacing.sm}>
                    <View style={styles.groupHead}>
                      <IconCircle icon="wrench-outline" tone="warning" size={40} />
                      <AppText variant="heading" color="warning" style={styles.flex}>
                        {`${he.maintenance.garageRecs} (${he.maintenance.notMandatory})`}
                      </AppText>
                    </View>
                    <AppText variant="small" color="textSecondary">
                      {he.maintenance.garageRecsNote}
                    </AppText>
                    {garageRecommendations.map((r, i) => (
                      <Stack key={r.id} gap={spacing.xxs}>
                        {i > 0 ? <Divider /> : null}
                        <AppText>{r.text}</AppText>
                        <AppText variant="caption" color="textMuted">
                          {joinParts([r.garage, formatDate(r.date)])}
                        </AppText>
                      </Stack>
                    ))}
                  </Stack>
                </Card>
              ) : null}
            </>
          ) : tab === 'info' ? (
            <Card testID="next-service-info">
              <Stack gap={spacing.sm}>
                <ListRow
                  icon="repeat"
                  title={he.maintenance.interval}
                  subtitle={next.intervalLabel}
                />
                {schedule.source ? (
                  <SourceLine
                    source={schedule.source}
                    onOpen={
                      schedule.source.documentId
                        ? () => openSource(schedule.source!.documentId!)
                        : undefined
                    }
                  />
                ) : null}
              </Stack>
            </Card>
          ) : history.length === 0 ? (
            <EmptyState icon="clipboard-text-clock-outline" title={he.maintenance.noHistory} />
          ) : (
            <View testID="next-service-history">
              {[...history]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e, i, list) => (
                  <TimelineItem
                    key={e.id}
                    status="done"
                    first={i === 0}
                    last={i === list.length - 1}
                    onPress={() => router.push(`/service/${e.id}`)}
                    accessibilityLabel={`${formatDate(e.date)}, ${formatKm(e.odometerKm)}`}
                  >
                    <View style={styles.groupHead}>
                      <AppText variant="bodyStrong" style={styles.flex}>
                        {formatDate(e.date)}
                      </AppText>
                      <Badge label={he.history.performed} tone="success" />
                    </View>
                    <AppText variant="small" color="textSecondary">
                      {formatKm(e.odometerKm)}
                    </AppText>
                  </TimelineItem>
                ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
