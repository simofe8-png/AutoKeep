import { useRouter } from 'expo-router';

import { useVehicleData } from '@/features/data/PrototypeDataContext';
import {
  MaintenanceItemList,
  NextServiceSummary,
  ScheduleUnavailable,
  SourceLine,
} from '@/features/maintenance/components';
import { AppHeader } from '@/features/shell/AppHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
} from '@/ui';

/**
 * Maintenance / next service (T017): one scrollable screen — interval, remaining distance/time and
 * forecast at the top; the action list below, each item expanding in place (T018).
 */
export default function MaintenanceScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { schedule, alerts } = useVehicleData(activeVehicle?.id ?? null);
  const openSource = (documentId: string) => router.push(`/documents/${documentId}`);
  const alertCount = alerts.filter((a) => !a.handled).length;

  return (
    <Screen
      header={<AppHeader alertCount={alertCount} compact />}
      edges={['top']}
      testID="screen-maintenance"
    >
      {schedule.status !== 'verified' ? (
        <ScheduleUnavailable schedule={schedule} onUploadManual={() => router.push('/documents')} />
      ) : !schedule.next ? (
        <EmptyState
          icon="check-circle-outline"
          title={he.home.noTasks}
          message={he.home.noTasksBody}
        />
      ) : (
        <>
          <Card>
            <NextServiceSummary next={schedule.next} />
          </Card>

          <Card>
            <Stack gap={spacing.xs}>
              <SectionHeader title={he.maintenance.actionsTitle} />
              <AppText variant="small" color="textMuted">
                {he.maintenance.expandHint}
              </AppText>
              <MaintenanceItemList items={schedule.next.items} onOpenSource={openSource} />
            </Stack>
          </Card>

          <Row gap={spacing.sm}>
            <Button
              testID="maintenance-garage-mode"
              label={he.home.garageMode}
              icon="garage-variant"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push('/garage')}
            />
            <Button
              testID="maintenance-record-service"
              label={he.home.recordService}
              icon="plus-circle-outline"
              style={{ flex: 1 }}
              onPress={() => router.push('/service/new')}
            />
          </Row>
        </>
      )}

      {schedule.status === 'verified' && schedule.upcoming.length > 0 ? (
        <Card compact>
          <SectionHeader title={he.maintenance.upcomingTitle} />
          {schedule.upcoming.map((u, i) => (
            <Stack key={u.id} gap={0}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon="calendar-blank-outline"
                title={u.title}
                subtitle={[
                  u.dueAtKm != null ? formatKm(u.dueAtKm) : null,
                  u.dueDate ? formatDate(u.dueDate) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Stack>
          ))}
        </Card>
      ) : null}

      {schedule.source ? (
        <Stack gap={spacing.xs}>
          <AppText variant="smallStrong" color="textSecondary">
            {he.maintenance.scheduleSource}
          </AppText>
          <SourceLine
            source={schedule.source}
            onOpen={
              schedule.source.documentId
                ? () => openSource(schedule.source!.documentId!)
                : undefined
            }
          />
        </Stack>
      ) : null}
    </Screen>
  );
}
