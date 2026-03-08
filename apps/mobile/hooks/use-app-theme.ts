import { Colors, Fonts, Motion, type ThemeColors, type ThemeName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useAppTheme(): {
  colorScheme: ThemeName;
  colors: ThemeColors;
  fonts: typeof Fonts;
  motion: typeof Motion;
} {
  const colorScheme = useColorScheme() ?? 'dark';

  return {
    colorScheme,
    colors: Colors[colorScheme],
    fonts: Fonts,
    motion: Motion,
  };
}
