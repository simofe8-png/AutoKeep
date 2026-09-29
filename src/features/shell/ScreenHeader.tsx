import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, BrandMark, colors, directionalIcons, Icon, IconButton, spacing } from '@/ui';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Defaults to router.back() (or Home when there is nothing to go back to). */
  onBack?: () => void;
  /** Action at the reading start (physical right), e.g. "+" — replaces the wordmark. */
  trailing?: ReactNode;
  /** Close (X) instead of the back chevron. */
  closeIcon?: boolean;
  /** Text next to the back chevron (reference: "< חזרה"). */
  backLabel?: string;
  /** AutoKeep wordmark at the reading start (reference headers of plan, alerts, recording). */
  brand?: boolean;
  /**
   * Menu (≡) instead of back: opens settings. It sits at the reading start (physical right in
   * RTL, like the app header); an action or the wordmark then moves to the end.
   */
  menu?: boolean;
}

/**
 * Header of secondary screens, as drawn in the approved references: the back control at the
 * physical left, the centred title (and subtitle), and at the reading start either an action,
 * the AutoKeep wordmark, or nothing.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailing,
  closeIcon = false,
  backLabel,
  brand = false,
  menu = false,
}: ScreenHeaderProps) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const wide = brand || backLabel != null;
  const start = trailing ?? (brand ? <BrandMark size={18} /> : null);
  const menuButton = menu ? (
    <IconButton
      testID="screen-header-menu"
      icon="menu"
      accessibilityLabel={he.header.settings}
      onPress={() => router.push('/settings')}
    />
  ) : null;
  const leading = backLabel ? (
    <Pressable
      testID="screen-header-back"
      onPress={back}
      accessibilityRole="button"
      accessibilityLabel={he.common.back}
      style={styles.backWithLabel}
      hitSlop={8}
    >
      <AppText variant="bodyStrong" color="primary">
        {backLabel}
      </AppText>
      <Icon name={directionalIcons.back} size={26} color="textPrimary" />
    </Pressable>
  ) : (
    <IconButton
      testID="screen-header-back"
      icon={closeIcon ? 'close' : directionalIcons.back}
      accessibilityLabel={closeIcon ? he.common.close : he.common.back}
      onPress={back}
    />
  );
  return (
    <View style={styles.row}>
      <View style={[styles.side, wide && styles.sideWide]}>{menuButton ?? start}</View>
      <View style={styles.titles}>
        <AppText
          variant="heading"
          align="center"
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="textSecondary" align="center" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.side, wide && styles.sideWide, styles.end]}>
        {menuButton ? start : leading}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 60,
    backgroundColor: colors.surface,
  },
  side: { width: 56, alignItems: 'flex-start', justifyContent: 'center' },
  sideWide: { width: 116 },
  end: { alignItems: 'flex-end' },
  titles: { flex: 1 },
  backWithLabel: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48 },
});
