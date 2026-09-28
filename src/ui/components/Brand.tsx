import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily } from '../theme';
import { Icon } from './Icon';

/** AutoKeep wordmark of the approved reference ("Auto" navy + "Keep" blue, car outline). */
export function BrandMark({ size = 24, testID }: { size?: number; testID?: string }) {
  return (
    <View
      testID={testID}
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel="AutoKeep"
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={[styles.word, { fontSize: size, lineHeight: size * 1.3 }]}
      >
        <Text style={{ color: colors.textPrimary }}>Auto</Text>
        <Text style={{ color: colors.primary }}>Keep</Text>
      </Text>
      <Icon name="car-outline" size={Math.round(size * 1.15)} color="textPrimary" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { fontFamily: fontFamily.bold, writingDirection: 'ltr' },
});
