import { StyleSheet, Text, View } from 'react-native';

import { he } from '@/i18n/he';

import { colors, fontFamily } from '../theme';

export type PlateSize = 'sm' | 'md' | 'lg';

const sizes: Record<PlateSize, { font: number; strip: number; padH: number; height: number }> = {
  sm: { font: 14, strip: 14, padH: 8, height: 26 },
  md: { font: 18, strip: 18, padH: 10, height: 34 },
  lg: { font: 24, strip: 22, padH: 14, height: 44 },
};

/**
 * Israeli registration plate (approved reference: yellow plate, blue "IL" strip on the physical
 * left). The plate itself is always laid out left-to-right like the real plate, inside the RTL UI.
 */
export function PlateBadge({
  number,
  size = 'md',
  testID,
}: {
  number: string;
  size?: PlateSize;
  testID?: string;
}) {
  const s = sizes[size];
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${he.plate.label} ${number}`}
      style={[styles.plate, { height: s.height }]}
    >
      <View style={[styles.strip, { width: s.strip }]}>
        <Text
          maxFontSizeMultiplier={1.2}
          style={[styles.il, { fontSize: Math.max(8, s.font * 0.45) }]}
        >
          IL
        </Text>
      </View>
      <View style={[styles.body, { paddingHorizontal: s.padH }]}>
        <Text
          maxFontSizeMultiplier={1.4}
          numberOfLines={1}
          style={[styles.number, { fontSize: s.font, lineHeight: s.font * 1.25 }]}
        >
          {number}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    direction: 'ltr',
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C79700',
    backgroundColor: colors.plateYellow,
  },
  strip: {
    backgroundColor: colors.plateBlue,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  il: { color: '#FFFFFF', fontFamily: fontFamily.bold },
  body: { justifyContent: 'center' },
  number: {
    color: colors.plateText,
    fontFamily: fontFamily.bold,
    writingDirection: 'ltr',
    letterSpacing: 0.5,
  },
});
