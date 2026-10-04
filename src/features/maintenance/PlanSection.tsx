import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { newLocalId, useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import type { MaintenancePlanVM, PlanItemVM, PlanRequestVM } from '@/features/data/types';
import { discoveryPresentation } from '@/features/maintenance/knowledge/planVM';
import { OwnerReviewCard } from '@/features/maintenance/OwnerReview';
import { displayValue } from '@/features/vehicles/RegistryFacts';
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
            {item.level === 'A'
              ? p.levelA
              : item.level === 'T'
                ? (item.corroboratingSources ?? 0) <= 1
                  ? [p.levelTSingle, p.confidence[item.confidence]].join(' · ')
                  : [
                      p.levelT,
                      p.levelTNote(item.corroboratingSources ?? 0),
                      p.confidence[item.confidence],
                    ].join(' · ')
                : `${p.levelB} · ${p.levelBNote}`}
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
              // The codes the applicable sources name, plus "I don't know" — any manufacturer.
              ...request.codes.map((c) => ({ value: c, label: c })),
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
          {request.sources.map((src) => (
            <Stack key={src.sourceSystemId} gap={spacing.xs}>
              <InlineNotice
                testID={`plan-official-source-${src.sourceSystemId}`}
                tone="info"
                title={`${p.officialSourceTitle} · ${src.israeli ? p.officialSourceIsraeli : p.officialSourceGlobal}`}
                message={`${p.officialSourceReason[src.reason]}${
                  src.url && src.reason !== 'no_digital_source'
                    ? `
${p.officialSourceUserStep}`
                    : ''
                }`}
              />
              {src.url && src.reason !== 'no_digital_source' ? (
                <Button
                  testID={`plan-official-link-${src.host}`}
                  label={p.openOfficialSource(src.host)}
                  icon="open-in-new"
                  variant="secondary"
                  fullWidth
                  onPress={() => void Linking.openURL(src.url!)}
                />
              ) : null}
            </Stack>
          ))}
        </Stack>
      );
    case 'no_official_source':
      return (
        <InlineNotice
          testID="plan-request-no-official-source"
          tone="neutral"
          message={p.noOfficialSource}
        />
      );
    case 'official_source_pending':
      return (
        <InlineNotice
          testID="plan-request-official-pending"
          tone="neutral"
          message={p.officialSourcePending}
        />
      );
    case 'model_year_unproven':
      return (
        <InlineNotice
          testID="plan-request-model-year"
          tone="neutral"
          message={p.modelYearUnproven}
        />
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

/** M-SOURCE discovery status: progress, result, retry and the document-upload fallback. */
function DiscoveryCard({
  status,
  identity,
  vehicleId,
  onUpload,
}: {
  status: NonNullable<MaintenancePlanVM['discovery']>;
  identity: MaintenancePlanVM['verifiedIdentity'];
  vehicleId: string;
  onUpload: () => void;
}) {
  const { retryMaintenanceDiscovery } = useAppData();
  const d = he.maintenancePlan.discovery;
  const state = discoveryPresentation(status, identity);
  const identityOnly = state === 'VERIFIED_IDENTITY_ONLY';
  const progress = state in d.progress ? d.progress[state as keyof typeof d.progress] : null;
  const summary = progress ? null : d.summary(status.sourcesFound, status.sourcesUsed);
  const message = progress
    ? progress
    : status.error
      ? d.error
      : state === 'READY'
        ? status.partial
          ? d.readyPartial
          : d.ready
        : state === 'CONDITIONALLY_READY'
          ? d.conditional
          : state === 'CONFLICTING_EVIDENCE'
            ? d.conflicting
            : identityOnly
              ? d.identityOnly
              : d.notFound;
  const tone: 'info' | 'success' | 'warning' | 'neutral' = progress
    ? 'info'
    : state === 'READY' && !status.partial
      ? 'success'
      : state === 'CONFLICTING_EVIDENCE' || state === 'CONDITIONALLY_READY' || status.partial
        ? 'warning'
        : 'neutral';
  return (
    <Card testID="plan-discovery" compact>
      <Stack gap={spacing.sm}>
        <InlineNotice
          testID={`plan-discovery-${state}`}
          tone={tone}
          title={d.title}
          message={
            summary
              ? `${message}
${summary}`
              : message
          }
        />
        {identityOnly && identity ? (
          <Stack gap={spacing.xxs} testID="plan-discovery-identity">
            <AppText variant="smallStrong">{d.identityTitle}</AppText>
            {identity.map((fact) => (
              <View key={fact.key} style={styles.identityRow} testID={`plan-identity-${fact.key}`}>
                <AppText variant="small" color="textSecondary" style={styles.flex}>
                  {he.vehicleSearch.facts[fact.key] ?? fact.key}
                </AppText>
                <AppText variant="smallStrong">{displayValue(fact)}</AppText>
              </View>
            ))}
          </Stack>
        ) : null}
        {status.retryAvailable && !progress ? (
          <Button
            testID="plan-discovery-retry"
            label={d.retry}
            icon="refresh"
            variant="secondary"
            fullWidth
            onPress={() => retryMaintenanceDiscovery(vehicleId)}
          />
        ) : null}
        {status.uploadDocumentAvailable && !progress ? (
          <Stack gap={spacing.xs} testID="plan-discovery-upload">
            <AppText variant="caption" color="textSecondary">
              {identityOnly ? d.identityFallback : d.uploadTitle}
            </AppText>
            {[d.uploadManual, d.uploadBooklet, d.uploadDocument].map((label, i) => (
              <Button
                key={label}
                testID={`plan-discovery-upload-${i}`}
                label={label}
                icon="file-upload-outline"
                variant="secondary"
                fullWidth
                onPress={onUpload}
              />
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}

/**
 * General guidance by propulsion type (owner decision 2026-10-03): its own card, clearly not the
 * manufacturer's schedule; never part of the plan, dues or reminders.
 */
function StandardGuidanceCard({ rows }: { rows: MaintenancePlanVM['standardGuidance'] | null }) {
  if (!rows?.length) return null;
  const g = he.maintenancePlan.standard;
  return (
    <Card testID="plan-standard-guidance">
      <Stack gap={spacing.sm}>
        <AppText variant="heading" accessibilityRole="header">
          {g.title}
        </AppText>
        <InlineNotice tone="info" message={g.note} />
        {rows.map((r) => (
          <View key={r.key} style={styles.whenRow} testID={`plan-standard-${r.key}`}>
            <AppText variant="body" style={styles.flex}>
              {r.label}
            </AppText>
            <AppText variant="bodyStrong">{r.interval}</AppText>
          </View>
        ))}
      </Stack>
    </Card>
  );
}

/**
 * The evidence-based maintenance plan (Task 9): verified requirements as a useful schedule, or —
 * when the evidence is insufficient — no interval at all, only the exact next action.
 */
export function PlanSection({ plan, vehicleId }: { plan: MaintenancePlanVM; vehicleId: string }) {
  const { upload, problem } = useBookletUpload(vehicleId);
  const p = he.maintenancePlan;
  if (plan.fallback) {
    // §24: no reliable schedule — say so plainly, ask for the importer's schedule, offer upload.
    const others = plan.requests.filter((r) => r.kind !== 'upload_booklet');
    const booklet = plan.requests.find((r) => r.kind === 'upload_booklet');
    return (
      <Stack testID="maintenance-plan">
        {/* First: what the owner can act on now (device check 2026-10-04: below the search card it
            was off-screen). */}
        <StandardGuidanceCard rows={plan.standardGuidance ?? null} />
        {plan.discovery ? (
          <DiscoveryCard
            status={plan.discovery}
            identity={plan.verifiedIdentity ?? null}
            vehicleId={vehicleId}
            onUpload={() => void upload()}
          />
        ) : null}
        <OwnerReviewCard
          proposals={plan.ownerReview?.proposals ?? []}
          issues={plan.ownerReview?.issues ?? []}
        />
        <Card tone="warning" testID="plan-fallback">
          <Stack gap={spacing.sm}>
            <View style={styles.needHead}>
              <Icon name="clipboard-alert-outline" size={24} color="warning" />
              <AppText variant="heading" style={styles.flex} accessibilityRole="header">
                {p.fallbackTitle}
              </AppText>
            </View>
            {p.fallbackMessage.map((line, i) => (
              <AppText key={i} variant="body" testID={`plan-fallback-message-${i}`}>
                {line}
              </AppText>
            ))}
            {plan.bookletUploaded ? (
              <InlineNotice
                testID="plan-booklet-received"
                tone="success"
                message={p.bookletReceived}
              />
            ) : null}
            {problem ? <InlineNotice tone="warning" message={problem} /> : null}
            <Button
              testID="plan-fallback-upload"
              label={p.fallbackUpload}
              icon="file-upload-outline"
              fullWidth
              onPress={() => void upload()}
            />
            {booklet?.kind === 'upload_booklet' ? (
              <AppText variant="caption" color="textSecondary" testID="plan-booklet-hint">
                {p.bookletHints[booklet.hint]}
              </AppText>
            ) : null}
            <AppText variant="caption" color="textSecondary" testID="plan-fallback-privacy">
              {p.fallbackPrivacy}
            </AppText>
          </Stack>
        </Card>
        {plan.items.length > 0 ? (
          <Stack gap={spacing.sm} testID="plan-items">
            <AppText variant="heading" accessibilityRole="header">
              {p.partialTitle}
            </AppText>
            <InlineNotice testID="plan-partial" tone="warning" message={p.partialBody} />
            {plan.items.map((item) => (
              <PlanItemCard key={item.key} item={item} />
            ))}
          </Stack>
        ) : null}
        {others.length > 0 ? (
          <Card testID="plan-fallback-details">
            <Stack gap={spacing.sm}>
              <AppText variant="bodyStrong">{p.fallbackDetailsTitle}</AppText>
              {others.map((r, i) => (
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
      </Stack>
    );
  }
  return (
    <Stack testID="maintenance-plan">
      <StandardGuidanceCard rows={plan.standardGuidance ?? null} />
      {plan.discovery ? (
        <DiscoveryCard
          status={plan.discovery}
          identity={plan.verifiedIdentity ?? null}
          vehicleId={vehicleId}
          onUpload={() => void upload()}
        />
      ) : null}
      <OwnerReviewCard
        proposals={plan.ownerReview?.proposals ?? []}
        issues={plan.ownerReview?.issues ?? []}
      />
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
            {plan.status === 'partial' ? p.partialTitle : p.scheduleTitle}
          </AppText>
          {plan.status === 'partial' ? (
            <InlineNotice testID="plan-partial" tone="warning" message={p.partialBody} />
          ) : null}
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
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
