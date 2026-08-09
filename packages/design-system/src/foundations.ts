export const BrandColors = {
  black: '#000000',
  orange: '#EF661F',
} as const;

export const OrangeScale = {
  50: '#FEF7F1',
  100: '#FCEADD',
  300: '#F3B181',
  500: '#DF702F',
  700: '#A94A1E',
  950: '#3A170A',
} as const;

export const CoolReadingScale = {
  50: '#F8F9FA',
  100: '#F1F2F4',
  300: '#D0D4DA',
  500: '#828892',
  800: '#26292D',
  950: '#000000',
} as const;

export const SemanticColorRoles = {
  light: {
    canvas: '#F5F7F8',
    surface: '#FFFFFF',
    raised: '#E9EDF0',
    primaryText: '#151719',
    secondaryText: '#5D646C',
    border: '#CFD4DA',
    brandAccent: BrandColors.orange,
    onAccent: BrandColors.black,
    inlineLink: '#B64012',
  },
  dark: {
    canvas: BrandColors.black,
    surface: '#14171A',
    raised: '#20252A',
    primaryText: '#F5F7F8',
    secondaryText: '#B2BAC2',
    border: '#343A40',
    brandAccent: BrandColors.orange,
    onAccent: BrandColors.black,
    inlineLink: '#FFAD7C',
  },
} as const;

export const StatusColors = {
  success: {
    accent: '#2F6B50',
    surface: '#E5F0E8',
  },
  warning: {
    accent: '#A45E10',
    surface: '#F6EBD8',
  },
  danger: {
    accent: '#B83A32',
    surface: '#F5E4E2',
  },
  information: {
    accent: '#3D648A',
    surface: '#E7EEF5',
  },
} as const;

const brand = {
  primary: BrandColors.orange,
  primaryLight: OrangeScale[100],
  primaryDark: OrangeScale[700],
  secondary: CoolReadingScale[500],
  secondaryLight: CoolReadingScale[300],
} as const;

// Compatibility aliases consumed by the deprecated Expo client. New surfaces
// should use StatusColors and SemanticColorRoles directly.
const legacySemantic = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export const ContentColors = {
  podcast: CoolReadingScale[500],
  video: CoolReadingScale[800],
  article: SemanticColorRoles.light.secondaryText,
  post: SemanticColorRoles.dark.border,
} as const;

export const ProviderColors = {
  youtube: BrandColors.black,
  spotify: CoolReadingScale[800],
  gmail: CoolReadingScale[500],
  substack: CoolReadingScale[800],
  twitter: CoolReadingScale[800],
  x: CoolReadingScale[800],
  pocket: SemanticColorRoles.dark.border,
  web: SemanticColorRoles.dark.border,
} as const;

export const FilterChipPalette = {
  article: {
    accent: BrandColors.orange,
    surface: BrandColors.orange,
  },
  podcast: {
    accent: BrandColors.orange,
    surface: BrandColors.orange,
  },
  video: {
    accent: BrandColors.orange,
    surface: BrandColors.orange,
  },
  post: {
    accent: BrandColors.orange,
    surface: BrandColors.orange,
  },
  completed: {
    accent: StatusColors.success.accent,
    surface: StatusColors.success.surface,
  },
} as const;

export const Colors = {
  light: {
    text: SemanticColorRoles.light.primaryText,
    textSubheader: SemanticColorRoles.light.secondaryText,
    textSecondary: SemanticColorRoles.light.secondaryText,
    textTertiary: '#94A3B8',
    textPrimary: SemanticColorRoles.light.primaryText,
    textInverse: SemanticColorRoles.dark.primaryText,
    background: SemanticColorRoles.light.canvas,
    backgroundSecondary: SemanticColorRoles.light.surface,
    backgroundTertiary: SemanticColorRoles.light.raised,
    surfaceCanvas: SemanticColorRoles.light.canvas,
    surfaceSubtle: SemanticColorRoles.light.surface,
    surfaceElevated: SemanticColorRoles.light.surface,
    surfaceRaised: SemanticColorRoles.light.raised,
    tint: SemanticColorRoles.light.brandAccent,
    tintLight: OrangeScale[100],
    link: SemanticColorRoles.light.inlineLink,
    icon: SemanticColorRoles.light.secondaryText,
    iconMuted: CoolReadingScale[300],
    accent: SemanticColorRoles.light.brandAccent,
    accentMuted: OrangeScale[100],
    accentForeground: SemanticColorRoles.light.onAccent,
    buttonPrimary: SemanticColorRoles.light.brandAccent,
    buttonPrimaryText: SemanticColorRoles.light.onAccent,
    tabIconDefault: SemanticColorRoles.light.secondaryText,
    tabIconSelected: brand.primary,
    card: SemanticColorRoles.light.surface,
    cardHover: CoolReadingScale[50],
    border: SemanticColorRoles.light.border,
    borderLight: SemanticColorRoles.light.raised,
    borderDefault: SemanticColorRoles.light.border,
    borderSubtle: SemanticColorRoles.light.raised,
    overlay: 'rgba(0, 0, 0, 0.5)',
    scrim: 'rgba(255, 255, 255, 0.82)',
    overlaySoft: 'rgba(0, 0, 0, 0.35)',
    overlayStrong: 'rgba(0, 0, 0, 0.5)',
    overlayHeavy: 'rgba(0, 0, 0, 0.8)',
    overlayScrim: 'rgba(255, 255, 255, 0.8)',
    overlayForeground: SemanticColorRoles.dark.primaryText,
    overlayForegroundMuted: 'rgba(245, 247, 248, 0.8)',
    overlayForegroundSubtle: 'rgba(245, 247, 248, 0.7)',
    statusSuccess: StatusColors.success.accent,
    statusWarning: StatusColors.warning.accent,
    statusError: StatusColors.danger.accent,
    statusInfo: StatusColors.information.accent,
    statusWarningForeground: SemanticColorRoles.dark.primaryText,
    statusSuccessSurface: StatusColors.success.surface,
    statusWarningSurface: StatusColors.warning.surface,
    statusErrorSurface: StatusColors.danger.surface,
    statusInfoSurface: StatusColors.information.surface,
    ...brand,
    ...legacySemantic,
  },
  dark: {
    text: SemanticColorRoles.dark.primaryText,
    textSubheader: SemanticColorRoles.dark.secondaryText,
    textSecondary: SemanticColorRoles.dark.secondaryText,
    textTertiary: '#6A6A6A',
    textPrimary: SemanticColorRoles.dark.primaryText,
    textInverse: SemanticColorRoles.light.primaryText,
    background: SemanticColorRoles.dark.canvas,
    backgroundSecondary: SemanticColorRoles.dark.surface,
    backgroundTertiary: SemanticColorRoles.dark.raised,
    surfaceCanvas: SemanticColorRoles.dark.canvas,
    surfaceSubtle: SemanticColorRoles.dark.raised,
    surfaceElevated: SemanticColorRoles.dark.surface,
    surfaceRaised: SemanticColorRoles.dark.raised,
    tint: SemanticColorRoles.dark.brandAccent,
    tintLight: OrangeScale[300],
    link: SemanticColorRoles.dark.inlineLink,
    icon: SemanticColorRoles.dark.secondaryText,
    iconMuted: CoolReadingScale[500],
    accent: SemanticColorRoles.dark.brandAccent,
    accentMuted: OrangeScale[700],
    accentForeground: SemanticColorRoles.dark.onAccent,
    buttonPrimary: SemanticColorRoles.dark.brandAccent,
    buttonPrimaryText: SemanticColorRoles.dark.onAccent,
    tabIconDefault: SemanticColorRoles.dark.secondaryText,
    tabIconSelected: SemanticColorRoles.dark.brandAccent,
    card: SemanticColorRoles.dark.surface,
    cardHover: SemanticColorRoles.dark.raised,
    border: SemanticColorRoles.dark.border,
    borderLight: CoolReadingScale[800],
    borderDefault: SemanticColorRoles.dark.border,
    borderSubtle: CoolReadingScale[800],
    overlay: 'rgba(0, 0, 0, 0.7)',
    scrim: 'rgba(0, 0, 0, 0.8)',
    overlaySoft: 'rgba(0, 0, 0, 0.5)',
    overlayStrong: 'rgba(0, 0, 0, 0.7)',
    overlayHeavy: 'rgba(0, 0, 0, 0.8)',
    overlayScrim: 'rgba(0, 0, 0, 0.8)',
    overlayForeground: SemanticColorRoles.dark.primaryText,
    overlayForegroundMuted: 'rgba(245, 247, 248, 0.8)',
    overlayForegroundSubtle: 'rgba(245, 247, 248, 0.7)',
    statusSuccess: StatusColors.success.accent,
    statusWarning: StatusColors.warning.accent,
    statusError: StatusColors.danger.accent,
    statusInfo: StatusColors.information.accent,
    statusWarningForeground: SemanticColorRoles.dark.primaryText,
    statusSuccessSurface: StatusColors.success.surface,
    statusWarningSurface: StatusColors.warning.surface,
    statusErrorSurface: StatusColors.danger.surface,
    statusInfoSurface: StatusColors.information.surface,
    ...brand,
    ...legacySemantic,
  },
} as const;

export type ThemeName = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ThemeName];
export type ThemeColorName = keyof ThemeColors;

export const Typography = {
  displayLarge: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700' as const,
    letterSpacing: -1,
  },
  displayMedium: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  headlineLarge: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  headlineMedium: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  headlineSmall: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600' as const,
  },
  titleLarge: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  titleSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
  labelSmall: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  labelSmallPlain: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
  },
} as const;

export const IconSizes = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 48,
  '3xl': 64,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const Motion = {
  duration: {
    fast: 150,
    normal: 200,
    slow: 300,
  },
  opacity: {
    pressed: 0.8,
    subdued: 0.6,
  },
  scale: {
    pressed: 0.98,
    subtle: 0.995,
  },
} as const;
