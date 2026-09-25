import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { usePrototypeData } from '@/features/data/PrototypeDataContext';
import { ActionTypeBadge } from '@/features/maintenance/components';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { formatDate, formatKm, SEP } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Card,
  Divider,
  EmptyState,
  Icon,
  ListRow,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  VerificationBadge,
} from '@/ui';

/** Service detail (T022): all actions, evidence and source quality. */
export default function ServiceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle } = usePrototypeData();

  // Resolve by explicit id across vehicles; the owning vehicle is shown, never assumed active.
  const owner = vehicles.find((v) => getBundle(v.id).history.some((e) => e.id === id));
  const bundle = owner ? getBundle(owner.id) : null;
  const event = bundle?.history.find((e) => e.id === id);

  if (!owner || !bundle || !event) {
    return (
      <Screen header={<ScreenHeader title={he.history.detailTitle} />}>
        <EmptyState icon="file-question-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  const docs = bundle.documents.filter((d) => event.documentIds.includes(d.id));

  return (
    <Screen testID="screen-service-detail" header={<ScreenHeader title={he.history.detailTitle} />}>
      <VehicleTargetBanner vehicle={owner} label={he.alerts.vehicle} />
      <Card>
        <Stack gap={spacing.xs}>
          <AppText variant="title">{formatDate(event.date)}</AppText>
          <AppText variant="bodyStrong" color="textSecondary">
            {formatKm(event.odometerKm)}
          </AppText>
          {event.garage ? <AppText>{event.garage}</AppText> : null}
          {event.notes ? (
            <AppText variant="small" color="textSecondary">
              {event.notes}
            </AppText>
          ) : null}
        </Stack>
      </Card>

      <Card>
        <SectionHeader title={he.maintenance.actionsTitle} />
        {event.actions.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.action} testID={`detail-action-${a.id}`}>
              <Icon
                name={a.performed ? 'check-circle' : 'close-circle-outline'}
                size={22}
                color={a.performed ? 'success' : 'textMuted'}
                accessibilityLabel={a.performed ? he.history.performed : he.history.notPerformed}
              />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{a.title}</AppText>
                <AppText variant="caption" color="textMuted">
                  {a.performed ? he.history.performed : he.history.notPerformed}
                  {a.unlisted ? `${SEP}${he.service.unlisted}` : ''}
                </AppText>
              </View>
              <ActionTypeBadge type={a.actionType} />
            </View>
          </View>
        ))}
      </Card>

      <Card testID="service-evidence">
        <SectionHeader title={he.history.evidence} />
        <Row style={styles.wrap}>
          <VerificationBadge state={event.verification} />
          <Badge label={he.authority[event.sourceAuthority]} tone="neutral" />
          <Badge label={he.history.origin[event.origin]} tone="info" />
        </Row>
      </Card>

      <Card compact>
        <SectionHeader title={he.history.documents} />
        {docs.length === 0 ? (
          <AppText color="textMuted" style={styles.empty}>
            {he.history.noDocuments}
          </AppText>
        ) : (
          docs.map((d) => (
            <ListRow
              key={d.id}
              icon="file-document-outline"
              title={d.title}
              subtitle={he.documents.kinds[d.kind]}
              onPress={() => router.push(`/documents/${d.id}`)}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { flexWrap: 'wrap' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  empty: { paddingVertical: spacing.md },
});
