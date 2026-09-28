import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, colors, directionalIcons, IconButton, spacing } from '@/ui';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Defaults to router.back(). */
  onBack?: () => void;
  /** Action at the reading start (e.g. "+", share). */
  trailing?: ReactNode;
  closeIcon?: boolean;
}

/**
 * Header of secondary (stack) screens, as in the approved references: centred title with an
 * optional subtitle, the back/close control at the reading end (physical left), an optional action
 * at the reading start.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailing,
  closeIcon = false,
}: ScreenHeaderProps) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.row}>
      <View style={styles.side}>{trailing}</View>
      <View style={styles.titles}>
        <AppText variant="heading" align="center" accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="textSecondary" align="center" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.side, styles.end]}>
        <IconButton
          testID="screen-header-back"
          icon={closeIcon ? 'close' : directionalIcons.forward}
          accessibilityLabel={closeIcon ? he.common.close : he.common.back}
          onPress={back}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  side: { width: 56, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  titles: { flex: 1, gap: 0 },
});
