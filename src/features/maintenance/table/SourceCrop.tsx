import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, colors, radii, spacing, Stack } from '@/ui';

import type { TableEvidence } from './parseTable';

const MAX_HEIGHT = 120;
const MARGIN = 8;

/**
 * The original spot on the owner's page image — one cell, or a whole row — shown next to its
 * reading (owner, 2026-10-08): the owner compares with the booklet itself, not with a guess.
 * Nothing is shown when the reading kept no page image or no position.
 */
export function SourceCrop({
  evidence,
  rowId,
  column,
  testID = 'table-source-crop',
}: {
  evidence: TableEvidence | null | undefined;
  rowId: string;
  /** A cell; absent: the whole row (item name and every column). */
  column?: number;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const row = evidence?.rows[rowId];
  const page = row ? evidence?.pages[row.page] : undefined;
  if (!row || !page?.uri || !page.width || !page.height) return null;
  const xs =
    column != null
      ? page.columns[column]
      : ([
          Math.min(page.itemColumn[0], ...page.columns.map((c) => c[0])),
          Math.max(page.itemColumn[1], ...page.columns.map((c) => c[1])),
        ] as [number, number]);
  if (!xs) return null;
  const box = {
    x: xs[0] - MARGIN,
    y: row.y0 - MARGIN,
    w: xs[1] - xs[0] + 2 * MARGIN,
    h: row.y1 - row.y0 + 2 * MARGIN,
  };
  const k = width ? Math.min(width / box.w, MAX_HEIGHT / box.h) : 0;
  return (
    <Stack gap={spacing.xxs} testID={testID}>
      <AppText variant="caption" color="textSecondary">
        {he.serviceTable.inBooklet}
      </AppText>
      <View style={styles.frame} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {k ? (
          <View style={[styles.window, { width: box.w * k, height: box.h * k }]}>
            <Image
              source={{ uri: page.uri }}
              accessibilityIgnoresInvertColors
              style={{
                position: 'absolute',
                left: -box.x * k,
                top: -box.y * k,
                width: page.width * k,
                height: page.height * k,
                // The reader straightened the page by this angle; the crop is turned the same way.
                transform: page.angle ? [{ rotate: `${-page.angle}deg` }] : undefined,
              }}
            />
          </View>
        ) : null}
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch', alignItems: 'center' },
  window: {
    overflow: 'hidden',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
