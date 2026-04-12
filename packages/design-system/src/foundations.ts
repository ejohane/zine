const brand = {
  primary: '#FFFFFF',
  primaryLight: '#E0E0E0',
  primaryDark: '#000000',
  secondary: '#6B6B6B',
  secondaryLight: '#8A8A8A',
} as const;

const semantic = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export const ContentColors = {
  podcast: '#3A3A3A',
  video: '#1A1A1A',
  article: '#5A5A5A',
  post: '#4A4A4A',
} as const;

export const ProviderColors = {
  youtube: '#2A2A2A',
  spotify: '#1A1A1A',
  gmail: '#1A73E8',
  substack: '#3A3A3A',
  twitter: '#2A2A2A',
  x: '#2A2A2A',
  pocket: '#4A4A4A',
  web: '#4A4A4A',
} as const;

export const FilterChipPalette = {
  article: {
    accent: '#3B82F6',
    surface: 'rgba(59, 130, 246, 0.16)',
  },
  podcast: {
    accent: '#1DB954',
    surface: 'rgba(29, 185, 84, 0.16)',
  },
  video: {
    accent: '#FF3B30',
    surface: 'rgba(255, 59, 48, 0.16)',
  },
  post: {
    accent: '#CFCFCF',
    surface: 'rgba(255, 255, 255, 0.1)',
  },
  completed: {
    accent: semantic.success,
    surface: 'rgba(16, 185, 129, 0.16)',
  },
} as const;

export const Colors = {
  light: {
    text: '#0F172A',
    textSubheader: 'rgba(15, 23, 42, 0.72)',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    textPrimary: '#0F172A',
    textInverse: '#FFFFFF',
    background: '#FFFFFF',
    backgroundSecondary: '#F8FAFC',
    backgroundTertiary: '#F1F5F9',
    surfaceCanvas: '#FFFFFF',
    surfaceSubtle: '#F8FAFC',
    surfaceElevated: '#FFFFFF',
    surfaceRaised: '#F1F5F9',
    tint: brand.primary,
    tintLight: brand.primaryLight,
    link: '#0066CC',
    icon: '#64748B',
    iconMuted: '#CBD5E1',
    accent: '#1A1A1A',
    accentMuted: '#E0E0E0',
    accentForeground: '#FFFFFF',
    buttonPrimary: '#1A1A1A',
    buttonPrimaryText: '#FFFFFF',
    tabIconDefault: '#94A3B8',
    tabIconSelected: brand.primary,
    card: '#FFFFFF',
    cardHover: '#F8FAFC',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    borderDefault: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    overlay: 'rgba(15, 23, 42, 0.5)',
    scrim: 'rgba(255, 255, 255, 0.8)',
    overlaySoft: 'rgba(15, 23, 42, 0.35)',
    overlayStrong: 'rgba(15, 23, 42, 0.5)',
    overlayHeavy: 'rgba(15, 23, 42, 0.8)',
    overlayScrim: 'rgba(255, 255, 255, 0.8)',
    overlayForeground: '#FFFFFF',
    overlayForegroundMuted: 'rgba(255, 255, 255, 0.8)',
    overlayForegroundSubtle: 'rgba(255, 255, 255, 0.7)',
    statusSuccess: semantic.success,
    statusWarning: semantic.warning,
    statusError: semantic.error,
    statusInfo: semantic.info,
    statusWarningForeground: '#000000',
    statusSuccessSurface: 'rgba(16, 185, 129, 0.1)',
    statusWarningSurface: 'rgba(245, 158, 11, 0.1)',
    statusErrorSurface: 'rgba(239, 68, 68, 0.1)',
    statusInfoSurface: 'rgba(59, 130, 246, 0.1)',
    ...brand,
    ...semantic,
  },
  dark: {
    text: '#FFFFFF',
    textSubheader: 'rgba(255, 255, 255, 0.82)',
    textSecondary: '#A0A0A0',
    textTertiary: '#6A6A6A',
    textPrimary: '#FFFFFF',
    textInverse: '#000000',
    background: '#000000',
    backgroundSecondary: '#1A1A1A',
    backgroundTertiary: '#2A2A2A',
    surfaceCanvas: '#000000',
    surfaceSubtle: '#1A1A1A',
    surfaceElevated: '#1A1A1A',
    surfaceRaised: '#2A2A2A',
    tint: '#FFFFFF',
    tintLight: '#E0E0E0',
    link: '#FFFFFF',
    icon: '#A0A0A0',
    iconMuted: '#4A4A4A',
    accent: '#FFFFFF',
    accentMuted: '#E0E0E0',
    accentForeground: '#000000',
    buttonPrimary: '#FFFFFF',
    buttonPrimaryText: '#000000',
    tabIconDefault: '#6A6A6A',
    tabIconSelected: '#FFFFFF',
    card: '#1A1A1A',
    cardHover: '#2A2A2A',
    border: '#2A2A2A',
    borderLight: '#1A1A1A',
    borderDefault: '#2A2A2A',
    borderSubtle: '#1A1A1A',
    overlay: 'rgba(0, 0, 0, 0.7)',
    scrim: 'rgba(0, 0, 0, 0.8)',
    overlaySoft: 'rgba(0, 0, 0, 0.5)',
    overlayStrong: 'rgba(0, 0, 0, 0.7)',
    overlayHeavy: 'rgba(0, 0, 0, 0.8)',
    overlayScrim: 'rgba(0, 0, 0, 0.8)',
    overlayForeground: '#FFFFFF',
    overlayForegroundMuted: 'rgba(255, 255, 255, 0.8)',
    overlayForegroundSubtle: 'rgba(255, 255, 255, 0.7)',
    statusSuccess: semantic.success,
    statusWarning: semantic.warning,
    statusError: semantic.error,
    statusInfo: semantic.info,
    statusWarningForeground: '#000000',
    statusSuccessSurface: 'rgba(16, 185, 129, 0.16)',
    statusWarningSurface: 'rgba(245, 158, 11, 0.16)',
    statusErrorSurface: 'rgba(239, 68, 68, 0.16)',
    statusInfoSurface: 'rgba(59, 130, 246, 0.16)',
    ...brand,
    ...semantic,
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
