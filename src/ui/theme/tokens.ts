/**
 * AutoKeep design tokens. Clean white / light-blue visual language with blue accents
 * (UX_DESIGN_BASELINE.md). Screens must consume these through shared components rather than
 * hard-coding values.
 */
export const colors = {
  primary: '#1B64D1',
  primaryPressed: '#1450AB',
  primarySoft: '#E7F0FD',
  primaryBorder: '#B9D2F7',

  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F4FA',
  border: '#DCE4EF',
  divider: '#E8EDF4',

  textPrimary: '#102035',
  textSecondary: '#44546A',
  textMuted: '#5E6B7D',
  textOnPrimary: '#FFFFFF',
  textDisabled: '#8C97A6',

  success: '#177A4B',
  successSoft: '#E4F4EC',
  warning: '#9A5B00',
  warningSoft: '#FFF3DC',
  danger: '#B42318',
  dangerPressed: '#8F1C13',
  dangerSoft: '#FDEBEA',
  neutral: '#44546A',
  neutralSoft: '#EEF1F5',

  overlay: 'rgba(16, 32, 53, 0.45)',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Minimum touch target (Android Material guideline: 48dp). */
export const touchTarget = 48;

/** Horizontal page gutter used by Screen. */
export const gutter = spacing.lg;

export const fontFamily = {
  regular: 'Heebo_400Regular',
  medium: 'Heebo_500Medium',
  bold: 'Heebo_700Bold',
} as const;

export const typography = {
  display: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fontFamily.medium, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Font scaling is allowed everywhere; very large multipliers are capped per variant to keep layouts usable. */
export const maxFontScale: Record<TypographyVariant, number> = {
  display: 1.6,
  title: 1.8,
  heading: 2,
  body: 2,
  bodyStrong: 2,
  small: 2,
  smallStrong: 2,
  caption: 2,
};

export const elevation = {
  card: {
    shadowColor: '#102035',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#102035',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;
