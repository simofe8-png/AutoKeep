import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import type { MaintenancePlanVM, PlanItemVM, PlanRequestVM } from '@/features/data/types';
import { formatDate, formatKm, formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  colors,
  FilterChips,
  Icon,
  InlineNotice,
  radii,
  spacing,
  Stack,
  type StatusTone,
} from '@/ui';

const STATE_TONE: Record<PlanItemVM['state'], StatusTone> = {
  ok: 'success',
  upcoming: 'warning',
  due: 'danger',
  overdue: 'danger',
};

/** "When" of an item: remaining distance / time, or how far past it is. */
export function planItemWhen(item: PlanItemVM): string[] {
  const p = he.maintenancePlan;
  return [
    item.remainingKm != null
      ? item.remainingKm < 0
        ? p.overKm(formatNumber(-item.remainingKm))
        : p.remainingKm(formatNumber(item.remainingKm))
      : null,
    item.remainingDays != null
      ? item.remainingDays < 0
        ? p.overDays(-item.remainingDays)
        : p.remainingDays(item.remainingDays)
      : null,
  ].filter((x): x is string => Boolean(x));
}

/** One maintenance task: what, inspection vs replacement, when, remaining, source. */
export function PlanItemCard({ item, testID }: { item: PlanItemVM; testID?: string }) {
  const p = he.maintenancePlan;
  return (
    <Card testID={testID ?? `plan-item-${item.key}`} compact>
      <View style={styles.itemHead}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{item.title}</AppText>
          <AppText variant="caption" color="textSecondary">
            {`${item.actionLabel} · ${item.intervalText}`}
          </AppText>
        </View>
        <Badge label={p.state[item.state]} tone={STATE_TONE[item.state]} />
      </View>
      <View style={styles.whenRow}>
        {item.nextKm != null ? (
          <AppText variant="small" testID={`plan-item-${item.task}-km`}>
            {formatKm(item.nextKm)}
          </AppText>
        ) : null}
        {item.nextDate ? (
          <AppText variant="small" testID={`plan-item-${item.task}-date`}>
            {formatDate(item.nextDate)}
          </AppText>
        ) : null}
        {planItemWhen(item).map((w) => (
          <AppText key={w} variant="small" color="textSecondary">
            {w}
          </AppText>
        ))}
      </View>
      {item.forecastDate ? (
        <AppText variant="caption" color="primary" testID={`plan-item-${item.task}-forecast`}>
          {`${he.forecast.label}: ${formatDate(item.forecastDate)}`}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textMuted">
        {item.lastDone
          ? p.lastDone(formatDate(item.lastDone.date), formatNumber(item.lastDone.km))
          : p.fromNew}
      </AppText>
      <View style={styles.source} testID={`plan-item-${item.key}-source`}>
        <Icon name="file-document-check-outline" size={18} color="textSecondary" />
        <View style={styles.flex}>
          {/* Never presents the manufacturer's document as an Israeli requirement (level B). */}
          <AppText
            variant="smallStrong"
            color={item.level === 'A' ? 'success' : 'warning'}
            testID={`plan-item-${item.key}-evidence`}
          >
            {item.level === 'A' ? p.levelA : `${p.levelB} · ${p.levelBNote}`}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {[item.source.sourceTitle, he.authority[item.source.authority], item.source.locator]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

/** Uploads a maintenance booklet for the vehicle (stored privately, owner-confirmed). */
function useBookletUpload(vehicleId: string) {
  const { isDemoData, addDocument, registerMaintenanceBooklet, today } = useAppData();
  const [problem, setProblem] = useState<string | null>(null);
  const services = isDemoData ? null : onboardingServices();
  const upload = async () => {
    if (!services) return;
    setProblem(null);
    const r = await services.acquisition.pickDocument();
    if (r.status === 'cancelled') return;
    if (r.status !== 'acquired') {
      return setProblem(
        r.status === 'rejected' ? he.onboarding.fileRejected : he.states.genericErrorTitle,
      );
    }
    const documentId = newLocalId('doc');
    addDocument(
      vehicleId,
      {
        documentId,
        file: r.file,
        title: he.documents.uploadTitle(
          he.documents.kinds.maintenance_schedule,
          formatDate(today()),
        ),
      },
      'maintenance_schedule',
    );
    registerMaintenanceBooklet(vehicleId, documentId);
  };
  return { upload, problem, available: services !== null };
}

function Request({
  request,
  vehicleId,
  onUpload,
}: {
  request: PlanRequestVM;
  vehicleId: string;
  onUpload: () => void;
}) {
  const router = useRouter();
  const { setMaintenanceAnswers } = useAppData();
  const p = he.maintenancePlan;
  switch (request.kind) {
    case 'upload_booklet':
      return (
        <Stack gap={spacing.xs} testID="plan-request-upload">
          <Button
            testID="plan-upload-booklet"
            label={p.uploadBooklet}
            icon="file-upload-outline"
            fullWidth
            onPress={onUpload}
          />
          <AppText variant="caption" color="textSecondary" testID="plan-booklet-hint">
            {p.bookletHints[request.hint]}
          </AppText>
        </Stack>
      );
    case 'service_regime':
      return (
        <Stack gap={spacing.xs} testID="plan-request-regime">
          <AppText variant="smallStrong">{p.serviceRegimeQuestion}</AppText>
          <FilterChips
            testID="plan-regime-options"
            accessibilityLabel={p.serviceRegimeQuestion}
            value={'' as string}
            onChange={(v) =>
              setMaintenanceAnswers(vehicleId, { serviceRegime: v === 'unknown' ? null : v })
            }
            options={[
              { value: 'QG0', label: 'QG0' },
              { value: 'QG1', label: 'QG1' },
              { value: 'QG2', label: 'QG2' },
              { value: 'unknown', label: p.unknownAnswer },
            ]}
          />
        </Stack>
      );
    case 'usage':
      return (
        <Stack gap={spacing.xs} testID="plan-request-usage">
          <AppText variant="smallStrong">{p.usageQuestion}</AppText>
          <FilterChips
            testID="plan-usage-options"
            accessibilityLabel={p.usageQuestion}
            value={'' as string}
            onChange={(v) =>
              setMaintenanceAnswers(vehicleId, {
                usage: v === 'unknown' ? null : (v as 'normal' | 'severe'),
              })
            }
            options={[
              { value: 'normal', label: p.usage.normal },
              { value: 'severe', label: p.usage.severe },
              { value: 'unknown', label: p.unknownAnswer },
            ]}
          />
        </Stack>
      );
    case 'engine_code':
      return (
        <InlineNotice
          testID="plan-request-engine-code"
          tone="info"
          message={p.engineCodeRequest}
          action={{
            label: he.lifecycle.editDetails,
            icon: 'pencil-outline',
            onPress: () => router.push(`/vehicle/${vehicleId}/edit`),
          }}
        />
      );
    case 'in_service_date':
      return (
        <InlineNotice testID="plan-request-in-service" tone="info" message={p.inServiceRequest} />
      );
    case 'odometer':
      return (
        <InlineNotice
          testID="plan-request-odometer"
          tone="info"
          message={p.odometerRequest}
          action={{
            label: he.home.updateOdometer,
            icon: 'road-variant',
            onPress: () => router.push('/odometer'),
          }}
        />
      );
    case 'official_source':
      return (
        <Stack gap={spacing.xs} testID="plan-request-official-source">
          <InlineNotice tone="info" title={p.officialSourceTitle} message={p.officialSourceBody} />
          {request.links.map((l) => (
            <Button
              key={l.url}
              testID={`plan-official-link-${l.host}`}
              label={p.openOfficialSource(l.host)}
              icon="open-in-new"
              variant="secondary"
              fullWidth
              onPress={() => void Linking.openURL(l.url)}
            />
          ))}
        </Stack>
      );
    case 'awaiting_verification':
      return (
        <InlineNotice
          testID="plan-request-awaiting"
          tone="neutral"
          title={p.awaitingTitle}
          message={`${request.sources.map((s) => s.title).join(' · ')}\n${p.awaitingBody}`}
        />
      );
  }
}

/**
 * The evidence-based maintenance plan (Task 9): verified requirements as a useful schedule, or —
 * when the evidence is insufficient — no interval at all, only the exact next action.
 */
export function PlanSection({ plan, vehicleId }: { plan: MaintenancePlanVM; vehicleId: string }) {
  const { upload, problem } = useBookletUpload(vehicleId);
  const p = he.maintenancePlan;
  return (
    <Stack testID="maintenance-plan">
      {plan.requests.length > 0 ? (
        <Card tone="warning" testID="plan-needs-information">
          <Stack gap={spacing.sm}>
            <View style={styles.needHead}>
              <Icon name="clipboard-alert-outline" size={24} color="warning" />
              <AppText variant="heading" style={styles.flex} accessibilityRole="header">
                {p.needInfoTitle}
              </AppText>
            </View>
            {plan.items.length === 0 ? (
              <AppText variant="small" color="textSecondary">
                {p.needInfoBody}
              </AppText>
            ) : null}
            {plan.bookletUploaded ? (
              <InlineNotice
                testID="plan-booklet-received"
                tone="success"
                message={p.bookletReceived}
              />
            ) : null}
            {problem ? <InlineNotice tone="warning" message={problem} /> : null}
            {plan.requests.map((r, i) => (
              <Request
                key={`${r.kind}-${i}`}
                request={r}
                vehicleId={vehicleId}
                onUpload={() => void upload()}
              />
            ))}
          </Stack>
        </Card>
      ) : null}
      {plan.items.length > 0 ? (
        <Stack gap={spacing.sm} testID="plan-items">
          <AppText variant="heading" accessibilityRole="header">
            {p.scheduleTitle}
          </AppText>
          {plan.items.map((item) => (
            <PlanItemCard key={item.key} item={item} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  whenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.xxs,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  needHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
