/**
 * AutoKeep design tokens. Clean white / light-blue visual language with blue accents
 * (UX_DESIGN_BASELINE.md). Screens must consume these through shared components rather than
 * hard-coding values.
 */
export const colors = {
  // Approved visual reference set (docs/design/approved/): vivid blue accent, navy text, white
  // cards on a near-white page. Values sampled from the reference images.
  primary: '#0062FE',
  primaryPressed: '#004FCC',
  primarySoft: '#EAF3FF',
  primaryBorder: '#BCD5FB',

  background: '#F8FAFD',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F6FC',
  surfaceTint: '#F0F7FE',
  border: '#E2E8F1',
  divider: '#EDF1F6',

  textPrimary: '#0E1B3D',
  textSecondary: '#3F4C66',
  textMuted: '#5D6880',
  textOnPrimary: '#FFFFFF',
  textDisabled: '#8C97A6',

  // Text-safe status colours (≥4.5:1 on white and on their soft backgrounds).
  success: '#127A3C',
  successSoft: '#E7FAED',
  successBorder: '#BDE8CB',
  warning: '#8F5400',
  warningSoft: '#FFF5DB',
  warningBorder: '#F6DB9A',
  danger: '#C62419',
  dangerPressed: '#A51D14',
  dangerSoft: '#FEEEEE',
  dangerBorder: '#F9C9C6',
  neutral: '#3F4C66',
  neutralSoft: '#EEF1F6',

  // Strong fills/icons of the reference (not for small text on white).
  successStrong: '#029A45',
  dangerStrong: '#FD2D26',
  attention: '#FECF02',
  attentionPressed: '#E8BC00',

  // Israeli registration plate.
  plateYellow: '#FEC201',
  plateBlue: '#0061FE',
  plateText: '#0B0B0B',

  overlay: 'rgba(14, 27, 61, 0.45)',
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
  lg: 18,
  xl: 22,
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
  // Type scale of the approved references (docs/design/approved/): compact, bold headings.
  display: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 34 },
  title: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 27 },
  heading: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 24 },
  /** Large figures in data tiles and status cards (km, dates). */
  metric: { fontFamily: fontFamily.bold, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Font scaling is allowed everywhere; very large multipliers are capped per variant to keep layouts usable. */
export const maxFontScale: Record<TypographyVariant, number> = {
  // Headings, figures and dense labels of the approved compositions scale less than running
  // text, so the layouts stay recognisable at larger system font sizes (the test device: 1.3).
  display: 1.1,
  title: 1.1,
  heading: 1.1,
  metric: 1.1,
  body: 1.5,
  bodyStrong: 1.4,
  small: 1.2,
  smallStrong: 1.2,
  caption: 1.15,
};

export const elevation = {
  card: {
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;
