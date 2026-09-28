import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii } from '../theme';
import { Icon, type IconName } from './Icon';

/**
 * Document thumbnail (reference: small page preview beside documents and history records).
 * A page-shaped tile marked with the file type; no file is decoded for list rows.
 */
export function DocumentThumb({
  mimeType,
  icon = 'file-document-outline',
  size = 56,
}: {
  mimeType?: string;
  icon?: IconName;
  size?: number;
}) {
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType?.startsWith('image/') ?? false;
  const label = isPdf ? 'PDF' : isImage ? 'IMG' : null;
  return (
    <View
      style={[styles.page, { width: size, height: Math.round(size * 1.25) }]}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.fold} />
      <View style={styles.lines}>
        <View style={[styles.line, { width: '80%' }]} />
        <View style={[styles.line, { width: '60%' }]} />
        <View style={[styles.line, { width: '70%' }]} />
      </View>
      <View style={styles.iconWrap}>
        <Icon
          name={isImage ? 'image-outline' : icon}
          size={Math.round(size * 0.34)}
          color="primary"
        />
      </View>
      {label ? (
        <View style={[styles.tag, isPdf ? styles.pdf : styles.img]}>
          <Text maxFontSizeMultiplier={1} style={styles.tagText}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 6,
    overflow: 'hidden',
  },
  fold: {
    position: 'absolute',
    top: 0,
    end: 0,
    width: 12,
    height: 12,
    backgroundColor: colors.surfaceMuted,
    borderBottomStartRadius: 4,
  },
  lines: { gap: 3, marginTop: 4 },
  line: { height: 2, borderRadius: 1, backgroundColor: colors.divider },
  iconWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tag: {
    position: 'absolute',
    bottom: 4,
    start: 4,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  pdf: { backgroundColor: colors.dangerStrong },
  img: { backgroundColor: colors.primary },
  tagText: { color: '#FFFFFF', fontSize: 9, fontFamily: fontFamily.bold },
});
