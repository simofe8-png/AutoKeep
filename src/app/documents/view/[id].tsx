import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppData, type OriginalView } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { he } from '@/i18n/he';
import { Button, colors, EmptyState, IconButton, Screen, spacing, ZoomableImage } from '@/ui';

/**
 * Full-screen viewer of an image document: the stored original, re-verified against its import
 * hash, shown as-is with pinch / drag / double-tap zoom. Read-only — back returns to where it was
 * opened from.
 */
export default function DocumentImageViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { vehicles, getBundle, getOriginal } = useAppData();
  const [original, setOriginal] = useState<OriginalView | null | undefined>(undefined);

  const owner = vehicles.find((v) => getBundle(v.id).documents.some((d) => d.id === id));
  const doc = owner ? getBundle(owner.id).documents.find((d) => d.id === id) : undefined;
  const ownerId = owner?.id;

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

  const details = () => router.replace(`/documents/${id}`);
  const intact = original?.integrity === 'intact' && original.mimeType.startsWith('image/');

  return (
    <Screen
      testID="screen-document-viewer"
      scroll={false}
      contentStyle={styles.content}
      header={
        <ScreenHeader
          title={doc?.title ?? he.documents.title}
          closeIcon
          trailing={
            doc ? (
              <IconButton
                testID="document-viewer-details"
                icon="information-outline"
                accessibilityLabel={he.documents.details}
                onPress={details}
              />
            ) : undefined
          }
        />
      }
    >
      {original === undefined && doc ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.surface} />
        </View>
      ) : intact ? (
        <ZoomableImage
          testID="document-viewer-image"
          uri={original.uri}
          accessibilityLabel={doc?.title}
        />
      ) : (
        <View style={styles.problem}>
          <EmptyState
            icon="file-alert-outline"
            title={
              !doc
                ? he.states.genericErrorTitle
                : original
                  ? he.documents.integrity[original.integrity]
                  : he.documents.noFile
            }
          />
          {doc ? (
            <Button
              testID="document-viewer-open-details"
              label={he.documents.details}
              variant="secondary"
              onPress={details}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  problem: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
});
