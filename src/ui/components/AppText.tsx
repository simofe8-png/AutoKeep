import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import {
  colors,
  maxFontScale,
  resolveTextAlign,
  typography,
  type ColorToken,
  type TypographyVariant,
} from '../theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'start' | 'center' | 'end';
}

/** The only text primitive screens should use. Handles typography, RTL alignment and font scaling. */
export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align = 'start',
  style,
  ...rest
}: AppTextProps) {
  const base: TextStyle = {
    ...typography[variant],
    color: colors[color],
    textAlign: resolveTextAlign(align),
  };
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale[variant]}
      {...rest}
      style={StyleSheet.flatten([base, style])}
    />
  );
}
