import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';

import { colors, radii, spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/**
 * Reusable loading / empty / error / offline states (UX baseline: avoid dead ends; every
 * recoverable state presents the relevant next action).
 */

export interface StateAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

export function LoadingState({ message = he.common.loading }: { message?: string }) {
  return (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText color="textSecondary" align="center">
        {message}
      </AppText>
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  action?: StateAction;
  secondaryAction?: StateAction;
  testID?: string;
}

export function EmptyState({
  title,
  message,
  icon = 'folder-open-outline',
  action,
  secondaryAction,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={32} color="primary" />
      </View>
      <AppText variant="heading" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {message ? (
        <AppText color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      <Actions action={action} secondaryAction={secondaryAction} />
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  testID?: string;
}

export function ErrorState({
  title = he.states.genericErrorTitle,
  message,
  action,
  secondaryAction,
  testID,
}: ErrorStateProps) {
  return (
    <View testID={testID} style={styles.center} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
        <Icon name="alert-circle-outline" size={32} color="danger" />
      </View>
      <AppText variant="heading" align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText color="textSecondary" align="center">
        {message}
      </AppText>
      <Actions action={action} secondaryAction={secondaryAction} />
    </View>
  );
}

function Actions({
  action,
  secondaryAction,
}: {
  action?: StateAction;
  secondaryAction?: StateAction;
}) {
  if (!action && !secondaryAction) return null;
  return (
    <View style={styles.actions}>
      {action ? (
        <Button label={action.label} icon={action.icon} onPress={action.onPress} fullWidth />
      ) : null}
      {secondaryAction ? (
        <Button
          label={secondaryAction.label}
          icon={secondaryAction.icon}
          onPress={secondaryAction.onPress}
          variant="secondary"
          fullWidth
        />
      ) : null}
    </View>
  );
}

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

const noticeTones: Record<
  NoticeTone,
  {
    bg: string;
    border: string;
    fg: 'primary' | 'warning' | 'danger' | 'success' | 'neutral';
    icon: IconName;
  }
> = {
  info: {
    bg: colors.primarySoft,
    border: colors.primaryBorder,
    fg: 'primary',
    icon: 'information-outline',
  },
  warning: {
    bg: colors.warningSoft,
    border: colors.warningBorder,
    fg: 'warning',
    icon: 'alert-outline',
  },
  danger: {
    bg: colors.dangerSoft,
    border: colors.dangerBorder,
    fg: 'danger',
    icon: 'alert-circle-outline',
  },
  success: {
    bg: colors.successSoft,
    border: '#B7E0CB',
    fg: 'success',
    icon: 'check-circle-outline',
  },
  neutral: {
    bg: colors.neutralSoft,
    border: colors.border,
    fg: 'neutral',
    icon: 'information-outline',
  },
};

export interface InlineNoticeProps {
  tone?: NoticeTone;
  title?: string;
  message: string;
  action?: StateAction;
  icon?: IconName;
  testID?: string;
}

/** In-context message with an optional corrective action (failures appear in context, spec §20). */
export function InlineNotice({
  tone = 'info',
  title,
  message,
  action,
  icon,
  testID,
}: InlineNoticeProps) {
  const t = noticeTones[tone];
  return (
    <View
      testID={testID}
      style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
      <View style={styles.noticeRow}>
        <Icon name={icon ?? t.icon} size={22} color={t.fg} />
        <View style={styles.noticeText}>
          {title ? (
            <AppText variant="bodyStrong" color={t.fg}>
              {title}
            </AppText>
          ) : null}
          <AppText variant="small" color="textPrimary">
            {message}
          </AppText>
        </View>
      </View>
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          variant="secondary"
          style={styles.noticeAction}
        />
      ) : null}
    </View>
  );
}

export interface OfflineBannerProps {
  /** Which network-dependent operation will resume later, when relevant. */
  pendingMessage?: string;
}

/** Offline indicator: saved information stays usable; tells which operation resumes later. */
export function OfflineBanner({ pendingMessage }: OfflineBannerProps) {
  return (
    <InlineNotice
      tone="neutral"
      icon="cloud-off-outline"
      title={he.states.offlineTitle}
      message={pendingMessage ?? he.states.offlineMessage}
      testID="offline-banner"
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  notice: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noticeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  noticeText: { flex: 1, gap: spacing.xxs },
  noticeAction: { alignSelf: 'flex-start' },
});
