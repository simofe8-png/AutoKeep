import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, colors, directionalIcons, IconButton, spacing } from '@/ui';

export interface ScreenHeaderProps {
  title: string;
  /** Defaults to router.back(). */
  onBack?: () => void;
  trailing?: ReactNode;
  closeIcon?: boolean;
}

/** Header for secondary (stack) screens: back/close at the start, title, optional trailing action. */
export function ScreenHeader({ title, onBack, trailing, closeIcon = false }: ScreenHeaderProps) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.row}>
      <IconButton
        testID="screen-header-back"
        icon={closeIcon ? 'close' : directionalIcons.back}
        accessibilityLabel={closeIcon ? he.common.close : he.common.back}
        onPress={back}
      />
      <AppText variant="heading" accessibilityRole="header" numberOfLines={2} style={styles.title}>
        {title}
      </AppText>
      {trailing ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { flex: 1 },
  spacer: { width: 48 },
});
