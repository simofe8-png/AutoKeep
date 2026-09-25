import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePrototypeData } from '@/features/data/PrototypeDataContext';
import { documentIcon } from '@/features/documents/icons';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  colors,
  EmptyState,
  Icon,
  InlineNotice,
  radii,
  Row,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  VerificationBadge,
} from '@/ui';

/**
 * Document detail (T023): the original file and the derived extraction are shown as separate
 * things. Evidence links in the app point here with an exact locator where possible.
 */
export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle } = usePrototypeData();
  const [openInfo, setOpenInfo] = useState(false);

  const owner = vehicles.find((v) => getBundle(v.id).documents.some((d) => d.id === id));
  const doc = owner ? getBundle(owner.id).documents.find((d) => d.id === id) : undefined;

  if (!owner || !doc) {
    return (
      <Screen header={<ScreenHeader title={he.documents.title} />}>
        <EmptyState icon="file-question-outline" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-document-detail" header={<ScreenHeader title={doc.title} />}>
      <VehicleTargetBanner vehicle={owner} label={he.alerts.vehicle} />

      <Card testID="document-original">
        <SectionHeader title={he.documents.original} />
        <View style={styles.preview} accessible accessibilityLabel={doc.title}>
          <Icon name={documentIcon[doc.kind]} size={48} color="primary" />
          <AppText variant="smallStrong" align="center">
            {doc.title}
          </AppText>
          {doc.pages ? (
            <AppText variant="caption" color="textMuted" align="center">
              {he.documents.pages(doc.pages)}
            </AppText>
          ) : null}
        </View>
        <Stack gap={spacing.sm}>
          <AppText variant="small" color="textMuted">
            {he.documents.originalHint}
          </AppText>
          <Row style={styles.wrap}>
            <VerificationBadge state={doc.verification} />
            <Badge
              label={`${he.documents.source}: ${he.authority[doc.authority]}`}
              tone="neutral"
            />
          </Row>
          <AppText variant="caption" color="textMuted">
            {he.documents.addedAt}: {formatDate(doc.addedAt)}
          </AppText>
          <Button
            testID="document-open-original"
            label={he.documents.openOriginal}
            icon="open-in-new"
            variant="secondary"
            onPress={() => setOpenInfo(true)}
          />
          {openInfo ? <InlineNotice tone="info" message={he.documents.uploadUnavailable} /> : null}
        </Stack>
      </Card>

      <Card testID="document-derived" tone="muted">
        <SectionHeader title={he.documents.derived} />
        <Stack gap={spacing.xs}>
          <AppText variant="bodyStrong">{he.documents.extraction[doc.extraction]}</AppText>
          {doc.extractionNote ? (
            <AppText variant="small" color="textSecondary">
              {doc.extractionNote}
            </AppText>
          ) : null}
        </Stack>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
  preview: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    marginVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.divider,
  },
});
