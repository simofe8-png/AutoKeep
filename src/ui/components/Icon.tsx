import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import { colors, type ColorToken } from '../theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorToken;
  /** Decorative by default; pass a label to expose the icon to screen readers. */
  accessibilityLabel?: string;
}

export function Icon({ name, size = 22, color = 'textSecondary', accessibilityLabel }: IconProps) {
  const exposed = accessibilityLabel != null;
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={colors[color]}
      accessible={exposed}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={exposed ? 'yes' : 'no-hide-descendants'}
    />
  );
}
