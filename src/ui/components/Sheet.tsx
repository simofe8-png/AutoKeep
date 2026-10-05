import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { he } from '@/i18n/he';

import { colors, elevation, radii, rootDirectionStyle, spacing } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}

/**
 * Bottom sheet: a window over the current screen where the owner completes one thing without
 * leaving it (owner decision 2026-10-05). Modals render outside the root view, so RTL direction
 * is re-applied here; the keyboard pushes the content up.
 */
export function Sheet({ visible, title, onClose, children, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={[styles.backdrop, rootDirectionStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={he.common.close}
          importantForAccessibility="no"
        />
        <View
          testID={testID}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <AppText variant="title" accessibilityRole="header" style={styles.title}>
              {title}
            </AppText>
            <IconButton
              testID={testID && `${testID}-close`}
              icon="close"
              accessibilityLabel={he.common.close}
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '90%',
    ...elevation.raised,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
});
