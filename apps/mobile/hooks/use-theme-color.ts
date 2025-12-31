/**
 * Theme Color Hook
 *
 * Provides theme-aware color resolution for React Native components.
 * Automatically switches between light and dark color values based on
 * the current system color scheme.
 *
 * @see https://docs.expo.dev/guides/color-schemes/
 * @module
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Resolves a color value based on the current theme (light/dark).
 *
 * @param props - Optional color overrides for light and dark themes
 * @param props.light - Custom color to use in light mode
 * @param props.dark - Custom color to use in dark mode
 * @param colorName - The color key from the theme's color palette
 * @returns The resolved color string for the current theme
 *
 * @example
 * ```tsx
 * const backgroundColor = useThemeColor({}, 'background');
 * const customText = useThemeColor({ light: '#000', dark: '#fff' }, 'text');
 * ```
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
