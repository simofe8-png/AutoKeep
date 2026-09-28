import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import {
  colors,
  directionalIcons,
  elevation,
  fontFamily,
  radii,
  spacing,
  type ColorToken,
} from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const toneColors: Record<
  StatusTone,
  { soft: string; border: string; strong: string; text: ColorToken }
> = {
  success: {
    soft: colors.successSoft,
    border: colors.successBorder,
    strong: colors.successStrong,
    text: 'success',
  },
  danger: {
    soft: colors.dangerSoft,
    border: colors.dangerBorder,
    strong: colors.dangerStrong,
    text: 'danger',
  },
  warning: {
    soft: colors.warningSoft,
    border: colors.warningBorder,
    strong: '#E39A00',
    text: 'warning',
  },
  info: {
    soft: colors.primarySoft,
    border: colors.primaryBorder,
    strong: colors.primary,
    text: 'primary',
  },
  neutral: {
    soft: colors.surfaceMuted,
    border: colors.border,
    strong: colors.textMuted,
    text: 'textSecondary',
  },
};

/** Round icon badge. `solid`: strong fill + white glyph (status markers of the reference). */
export function IconCircle({
  icon,
  tone = 'info',
  size = 44,
  solid = false,
}: {
  icon: IconName;
  tone?: StatusTone;
  size?: number;
  solid?: boolean;
}) {
  const t = toneColors[tone];
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: solid ? t.strong : t.soft,
        },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} color={solid ? 'textOnPrimary' : t.text} />
    </View>
  );
}

/**
 * Data tile (reference: "ק"מ נוכחי", "הטיפול הבא", "נותר עד טיפול"): icon, label, a large value
 * and an optional detail line. Pressable when `onPress` is given.
 */
export function StatTile({
  icon,
  label,
  value,
  detail,
  onPress,
  testID,
  accessibilityHint,
  align = 'start',
  style,
  iconColor = 'primary',
}: {
  iconColor?: ColorToken;
  icon: IconName;
  label: string;
  value: string;
  detail?: string;
  onPress?: () => void;
  testID?: string;
  accessibilityHint?: string;
  /** 'center': compact tiles in a row of four. */
  align?: 'start' | 'center';
  style?: ViewStyle;
}) {
  const centered = align === 'center';
  const text = (
    <View style={[styles.tileText, centered && styles.tileTextCentered]}>
      <View style={[styles.tileTop, centered && styles.tileTopCentered]}>
        <Icon name={icon} size={centered ? 24 : 26} color={iconColor} />
        {!centered ? (
          <AppText variant="small" color="textSecondary" style={styles.flex}>
            {label}
          </AppText>
        ) : null}
      </View>
      <AppText
        variant={centered ? 'smallStrong' : 'metric'}
        align={centered ? 'center' : 'start'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={centered ? styles.compactValue : undefined}
      >
        {value}
      </AppText>
      {centered ? (
        <AppText variant="caption" color="textSecondary" align="center" numberOfLines={2}>
          {label}
        </AppText>
      ) : null}
      {detail ? (
        <AppText
          variant={centered ? 'caption' : 'small'}
          color="textMuted"
          align={centered ? 'center' : 'start'}
          numberOfLines={centered ? 1 : undefined}
          adjustsFontSizeToFit={centered}
        >
          {detail}
        </AppText>
      ) : null}
    </View>
  );
  const body = (
    <>
      {text}
      {onPress && !centered ? (
        <Icon name={directionalIcons.forward} size={20} color="textPrimary" />
      ) : null}
    </>
  );
  const a11y = [label, value, detail].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.tile, style]} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [styles.tile, style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** Row of tiles that wraps at large font scales instead of squeezing. */
export function TileRow({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={styles.tileRow}>
      {children}
    </View>
  );
}

/**
 * Coloured status card of the reference (green "next service"/"verified", red "overdue", amber
 * "soon"): solid icon marker, coloured title, detail, optional chevron and content below.
 */
export function StatusCard({
  tone,
  icon,
  title,
  subtitle,
  onPress,
  children,
  testID,
  accessibilityHint,
  compact = false,
}: {
  /** One-row banner (reference plan: "תוכנית טיפולים רשמית ומאומתת"). */
  compact?: boolean;
  tone: StatusTone;
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  children?: ReactNode;
  testID?: string;
  accessibilityHint?: string;
}) {
  const t = toneColors[tone];
  const head = (
    <View style={styles.statusRow}>
      <IconCircle icon={icon} tone={tone} solid size={compact ? 36 : 44} />
      <View style={styles.flex}>
        <AppText
          variant={compact ? 'smallStrong' : 'heading'}
          color={tone === 'neutral' ? 'textPrimary' : t.text}
          style={compact ? styles.compactTitle : undefined}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant={compact ? 'caption' : 'small'} color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {onPress ? <Icon name={directionalIcons.forward} size={24} color="textPrimary" /> : null}
    </View>
  );
  const style = [
    styles.status,
    compact && styles.statusCompact,
    { backgroundColor: t.soft, borderColor: t.border },
  ];
  const content = (
    <>
      {head}
      {children ? <View style={styles.statusChildren}>{children}</View> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={style}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: t.border }}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** Home shortcut tile (reference: תוכנית טיפולים / מסמכים / היסטוריית טיפולים / מצב מוסך). */
export function QuickActionTile({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}>
        <Icon name={icon} size={26} color="primary" />
      </View>
      <AppText variant="caption" align="center" numberOfLines={2} style={styles.quickLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function QuickActionGrid({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={styles.quickGrid}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  circle: { alignItems: 'center', justifyContent: 'center' },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    ...elevation.card,
  },
  tileText: { flex: 1, gap: spacing.xxs },
  tileTextCentered: { alignItems: 'center' },
  compactValue: { fontSize: 15, lineHeight: 20 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileTopCentered: { justifyContent: 'center' },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pressed: { opacity: 0.9 },
  status: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusCompact: { paddingVertical: spacing.sm, borderRadius: radii.lg },
  compactTitle: { fontSize: 15, lineHeight: 21, fontFamily: fontFamily.bold },
  statusChildren: { gap: spacing.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 72,
    minHeight: 100,
    backgroundColor: colors.surfaceTint,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    gap: spacing.xs,
  },
  quickLabel: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 17 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Label/value row of detail lists (reference "פרטי הרכב"): label at the start, value, action. */
export function InfoRow({
  label,
  value,
  action,
  testID,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={infoStyles.row}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <AppText variant="small" color="textMuted" style={infoStyles.label}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={infoStyles.value}>
        {value}
      </AppText>
      {action}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  label: { width: 112 },
  value: { flex: 1 },
});
