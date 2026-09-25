import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { he } from '@/i18n/he';

import { colors, radii, resolveTextAlign, spacing, touchTarget, typography } from '../theme';
import { AppText } from './AppText';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Unit displayed at the end of the field, e.g. ק״מ. */
  suffix?: string;
  multiline?: boolean;
  editable?: boolean;
  testID?: string;
  maxLength?: number;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  required = false,
  keyboardType,
  suffix,
  multiline = false,
  editable = true,
  testID,
  maxLength,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;
  const labelText = required ? label : `${label} (${he.common.optional})`;

  return (
    <View style={styles.wrapper}>
      <AppText variant="smallStrong" color="textSecondary" nativeID={testID && `${testID}-label`}>
        {labelText}
      </AppText>
      <View
        style={[
          styles.field,
          { borderColor },
          !editable && styles.disabled,
          multiline && styles.multiline,
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={labelText}
          accessibilityHint={error ?? hint}
          accessibilityState={{ disabled: !editable }}
          maxFontSizeMultiplier={2}
          style={[
            styles.input,
            { textAlign: resolveTextAlign('start') },
            multiline && styles.inputMultiline,
          ]}
        />
        {suffix ? (
          <AppText variant="small" color="textMuted">
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    borderWidth: 1.5,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  disabled: { backgroundColor: colors.surfaceMuted },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
});
