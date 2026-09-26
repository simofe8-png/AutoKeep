import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useAppData, type OriginalView } from '@/features/data/DataContext';
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
  const { id, locator } = useLocalSearchParams<{ id: string; locator?: string }>();
  const { vehicles, getBundle, getOriginal, openOriginal } = useAppData();
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [original, setOriginal] = useState<OriginalView | null | undefined>(undefined);

  const owner = vehicles.find((v) => getBundle(v.id).documents.some((d) => d.id === id));
  const doc = owner ? getBundle(owner.id).documents.find((d) => d.id === id) : undefined;
  const ownerId = owner?.id;

  // T123/T125: load the stored original and re-verify it against the hash recorded at import.
  useEffect(() => {
    let cancelled = false;
    if (ownerId && id) {
      void getOriginal(ownerId, id).then((o) => {
        if (!cancelled) setOriginal(o);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ownerId, id, getOriginal]);

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
      {locator ? (
        <InlineNotice
          testID="document-evidence-locator"
          tone="info"
          title={he.documents.evidenceLocation}
          message={locator}
        />
      ) : null}

      <Card testID="document-original">
        <SectionHeader title={he.documents.original} />
        <View style={styles.preview} accessible accessibilityLabel={doc.title}>
          {original && original.integrity === 'intact' && original.mimeType.startsWith('image/') ? (
            <Image
              testID="document-original-image"
              source={{ uri: original.uri }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <Icon name={documentIcon[doc.kind]} size={48} color="primary" />
          )}
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
          {original ? (
            <Badge
              testID={`document-integrity-${original.integrity}`}
              label={he.documents.integrity[original.integrity]}
              tone={original.integrity === 'intact' ? 'success' : 'danger'}
              icon={original.integrity === 'intact' ? 'shield-check-outline' : 'alert-outline'}
            />
          ) : (
            <AppText variant="small" color="textMuted">
              {original === null ? he.documents.noFile : he.documents.originalHint}
            </AppText>
          )}
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
            disabled={original?.integrity === 'missing'}
            onPress={async () => {
              if (!original) return setOpenInfo(he.documents.noFile);
              const ok = await openOriginal(owner.id, doc.id);
              setOpenInfo(ok ? null : he.documents.openFailed);
            }}
          />
          {openInfo ? (
            <InlineNotice testID="document-open-info" tone="info" message={openInfo} />
          ) : null}
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
  image: { width: '100%', height: 220 },
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
