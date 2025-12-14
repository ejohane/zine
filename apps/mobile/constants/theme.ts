/**
 * Zine Design System
 *
 * A calm, focused design language inspired by the best of Spotify, YouTube, and Substack.
 * Optimized for content curation with low cognitive load and clear visual hierarchy.
 */

import { Platform } from 'react-native';

// Brand colors
const brand = {
  primary: '#6366F1', // Indigo - main accent
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  secondary: '#EC4899', // Pink - for highlights
  secondaryLight: '#F472B6',
};

// Semantic colors
const semantic = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// Content type colors (for visual categorization)
export const ContentColors = {
  podcast: '#8B5CF6', // Purple
  video: '#EF4444', // Red (YouTube-inspired)
  article: '#3B82F6', // Blue
  post: '#14B8A6', // Teal
};

// Provider colors
export const ProviderColors = {
  youtube: '#FF0000',
  spotify: '#1DB954',
  substack: '#FF6719',
  twitter: '#1DA1F2',
  pocket: '#EF4154',
};

export const Colors = {
  light: {
    // Core
    text: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    background: '#FFFFFF',
    backgroundSecondary: '#F8FAFC',
    backgroundTertiary: '#F1F5F9',

    // Interactive
    tint: brand.primary,
    tintLight: brand.primaryLight,
    icon: '#64748B',
    iconMuted: '#CBD5E1',

    // Tab bar
    tabIconDefault: '#94A3B8',
    tabIconSelected: brand.primary,

    // Cards & surfaces
    card: '#FFFFFF',
    cardHover: '#F8FAFC',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',

    // Overlays
    overlay: 'rgba(15, 23, 42, 0.5)',
    scrim: 'rgba(255, 255, 255, 0.8)',

    // Brand
    ...brand,
    ...semantic,
  },
  dark: {
    // Core
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    background: '#0F172A',
    backgroundSecondary: '#1E293B',
    backgroundTertiary: '#334155',

    // Interactive
    tint: brand.primaryLight,
    tintLight: brand.primary,
    icon: '#94A3B8',
    iconMuted: '#475569',

    // Tab bar
    tabIconDefault: '#64748B',
    tabIconSelected: brand.primaryLight,

    // Cards & surfaces
    card: '#1E293B',
    cardHover: '#334155',
    border: '#334155',
    borderLight: '#1E293B',

    // Overlays
    overlay: 'rgba(0, 0, 0, 0.7)',
    scrim: 'rgba(15, 23, 42, 0.8)',

    // Brand
    ...brand,
    ...semantic,
  },
};

// Typography scale
export const Typography = {
  // Display - for hero sections
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

  // Headlines
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

  // Titles
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

  // Body
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

  // Labels
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
};

// Spacing scale (4px base)
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
};

// Border radius
export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

// Shadows
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
