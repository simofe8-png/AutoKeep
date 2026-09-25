import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import {
  colors,
  ensureRtlParagraph,
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

/** Keeps Latin-leading strings in an RTL paragraph (see ensureRtlParagraph). */
function rtlChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') return ensureRtlParagraph(children);
  if (Array.isArray(children) && typeof children[0] === 'string') {
    return [ensureRtlParagraph(children[0]), ...children.slice(1)];
  }
  return children;
}

/** The only text primitive screens should use. Handles typography, RTL alignment and font scaling. */
export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align = 'start',
  style,
  children,
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
    >
      {rtlChildren(children)}
    </Text>
  );
}
