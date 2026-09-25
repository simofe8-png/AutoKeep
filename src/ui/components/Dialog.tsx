import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';

import { colors, elevation, radii, rootDirectionStyle, spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  /** Destructive confirmations use the danger style (e.g. permanent delete). */
  destructive?: boolean;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  testID?: string;
}

/**
 * Modal confirmation dialog. Destructive operations must go through this (explicit confirmation).
 * Modals render outside the root view, so RTL direction is re-applied here.
 */
export function Dialog({
  visible,
  title,
  message,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  destructive = false,
  confirmDisabled = false,
  confirmLoading = false,
  testID,
}: DialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, rootDirectionStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel ?? he.common.close}
          importantForAccessibility="no"
        />
        <View
          testID={testID}
          style={styles.sheet}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <ScrollView contentContainerStyle={styles.content}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {message ? <AppText color="textSecondary">{message}</AppText> : null}
            {children}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              disabled={confirmDisabled}
              loading={confirmLoading}
              fullWidth
              testID={testID && `${testID}-confirm`}
            />
            <Button
              label={cancelLabel ?? he.common.cancel}
              onPress={onCancel}
              variant="ghost"
              fullWidth
              testID={testID && `${testID}-cancel`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    maxHeight: '85%',
    overflow: 'hidden',
    ...elevation.raised,
  },
  content: { padding: spacing.xl, gap: spacing.md },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.xs },
});
