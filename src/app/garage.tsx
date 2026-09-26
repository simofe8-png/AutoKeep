import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { newLocalId, useAppData, useVehicleData } from '@/features/data/DataContext';
import { ActionTypeBadge, dueAtText, DueStatusBadge } from '@/features/maintenance/components';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatDate, formatKm, joinParts, todayIso } from '@/features/vehicles/format';
import { vehicleDisplayName } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  colors,
  Dialog,
  Divider,
  Icon,
  InlineNotice,
  radii,
  Row,
  Screen,
  spacing,
  Stack,
  TextField,
  type IconName,
} from '@/ui';

/**
 * Garage Mode (T019): a clean view for a service advisor. Three sections stay visibly separate;
 * a garage recommendation never becomes a manufacturer requirement.
 */
export default function GarageModeScreen() {
  const { activeVehicle } = useActiveVehicle();
  const { addGarageRecommendation } = useAppData();
  const data = useVehicleData(activeVehicle?.id ?? null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [shareInfo, setShareInfo] = useState(false);

  if (!activeVehicle) return null;
  const { schedule, history, deferred, garageRecommendations } = data;
  const last = history[0];

  return (
    <Screen
      testID="screen-garage"
      header={
        <ScreenHeader
          title={he.garage.title}
          trailing={
            <Button
              testID="garage-share"
              label={he.garage.share}
              variant="ghost"
              icon="share-variant-outline"
              onPress={() => setShareInfo(true)}
            />
          }
        />
      }
    >
      <AppText color="textSecondary">{he.garage.intro}</AppText>
      <VehicleTargetBanner vehicle={activeVehicle} label={he.alerts.vehicle} />
      {shareInfo ? <InlineNotice tone="info" message={he.garage.shareUnavailable} /> : null}

      <Section
        testID="garage-section-manufacturer"
        icon="factory"
        title={he.garage.manufacturerSection}
        tone="primary"
      >
        {schedule.status === 'verified' && schedule.next ? (
          <Stack gap={spacing.xs}>
            <Row gap={spacing.sm}>
              <AppText variant="bodyStrong" style={styles.flex}>
                {schedule.next.title}
              </AppText>
              <DueStatusBadge status={schedule.next.status} />
            </Row>
            <KV label={he.garage.dueAt} value={dueAtText(schedule.next)} />
            <KV label={he.garage.interval} value={schedule.next.intervalLabel} />
            {schedule.next.items.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.itemRow}>
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{item.title}</AppText>
                    {item.source?.locator ? (
                      <AppText variant="caption" color="textMuted">
                        {joinParts([item.source.sourceTitle, item.source.locator])}
                      </AppText>
                    ) : null}
                  </View>
                  <ActionTypeBadge type={item.actionType} />
                </View>
              </View>
            ))}
            {schedule.source ? (
              <AppText variant="caption" color="textMuted" testID="garage-schedule-source">
                {`${he.garage.scheduleSource}: ${joinParts([
                  schedule.source.sourceTitle,
                  he.authority[schedule.source.authority],
                  schedule.source.version,
                ])}`}
              </AppText>
            ) : null}
          </Stack>
        ) : (
          <Stack gap={spacing.xs}>
            <AppText color="textSecondary">{he.garage.noManufacturer}</AppText>
            {schedule.statusReason ? (
              <AppText variant="caption" color="textMuted">
                {schedule.statusReason}
              </AppText>
            ) : null}
          </Stack>
        )}
      </Section>

      <Section
        testID="garage-section-known"
        icon="database-check-outline"
        title={he.garage.knownSection}
        tone="neutral"
      >
        <Stack gap={spacing.xs}>
          <KV label={he.onboarding.fields.model} value={vehicleDisplayName(activeVehicle)} />
          <KV label={he.onboarding.fields.registration} value={activeVehicle.registration} />
          <KV
            label={he.home.odometerTitle}
            value={`${formatKm(activeVehicle.odometerKm)} (${formatDate(activeVehicle.odometerMeasuredAt)})`}
          />
          <KV
            label={he.garage.lastService}
            value={
              last
                ? joinParts([
                    formatDate(last.date),
                    formatKm(last.odometerKm),
                    last.actions
                      .filter((a) => a.performed)
                      .map((a) => a.title)
                      .join(', '),
                    // Provenance: a garage document vs. the user's own report.
                    he.authority[last.sourceAuthority],
                  ])
                : he.garage.noHistory
            }
          />
          {history.length > 0 ? (
            <KV label={he.garage.recordedServices} value={String(history.length)} />
          ) : null}
          {deferred.length > 0 ? (
            <KV label={he.garage.deferred} value={deferred.map((d) => d.title).join(', ')} />
          ) : null}
        </Stack>
      </Section>

      <Section
        testID="garage-section-garage"
        icon="account-wrench-outline"
        title={he.garage.garageSection}
        tone="warning"
      >
        <Badge label={he.garage.garageDisclaimer} tone="warning" icon="information-outline" />
        {garageRecommendations.length === 0 ? (
          <AppText color="textSecondary">{he.garage.noGarageNotes}</AppText>
        ) : (
          garageRecommendations.map((r) => (
            <View key={r.id} style={styles.note} testID={`garage-note-${r.id}`}>
              <AppText>{r.text}</AppText>
              <AppText variant="caption" color="textMuted">
                {joinParts([
                  r.garage,
                  formatDate(r.date),
                  r.authority === 'garage_document'
                    ? he.garage.noteFromDocument
                    : r.authority === 'user_report'
                      ? he.garage.noteFromUser
                      : null,
                ])}
              </AppText>
            </View>
          ))
        )}
        <Button
          testID="garage-add-note"
          label={he.garage.addNote}
          icon="plus"
          variant="secondary"
          onPress={() => setNoteOpen(true)}
        />
      </Section>

      <Dialog
        visible={noteOpen}
        title={he.garage.addNote}
        confirmLabel={he.common.save}
        confirmDisabled={note.trim().length === 0}
        onConfirm={() => {
          addGarageRecommendation({
            id: newLocalId('rec'),
            vehicleId: activeVehicle.id,
            text: note.trim(),
            date: todayIso(),
          });
          setNote('');
          setNoteOpen(false);
        }}
        onCancel={() => setNoteOpen(false)}
        testID="garage-note-dialog"
      >
        <TextField
          testID="garage-note-input"
          label={he.garage.noteLabel}
          value={note}
          onChangeText={setNote}
          placeholder={he.garage.notePlaceholder}
          multiline
          required
        />
      </Dialog>
    </Screen>
  );
}

const sectionTone = {
  primary: { border: colors.primaryBorder, bg: colors.primarySoft, fg: 'primary' },
  neutral: { border: colors.border, bg: colors.surfaceMuted, fg: 'textSecondary' },
  warning: { border: '#F2D49B', bg: colors.warningSoft, fg: 'warning' },
} as const;

function Section({
  title,
  icon,
  tone,
  children,
  testID,
}: {
  title: string;
  icon: IconName;
  tone: keyof typeof sectionTone;
  children: ReactNode;
  testID: string;
}) {
  const t = sectionTone[tone];
  return (
    <Card padded={false} testID={testID}>
      <View style={[styles.sectionHeader, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
        <Icon name={icon} size={22} color={t.fg} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          {title}
        </AppText>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <Row gap={spacing.sm} style={styles.kv}>
      <AppText variant="small" color="textMuted" style={styles.kvLabel}>
        {label}
      </AppText>
      <AppText variant="smallStrong" style={styles.flex}>
        {value}
      </AppText>
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  sectionBody: { padding: spacing.lg, gap: spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  note: {
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xxs,
  },
  kv: { alignItems: 'flex-start' },
  kvLabel: { width: 110 },
});
