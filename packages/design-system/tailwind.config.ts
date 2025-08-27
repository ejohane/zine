import type { Config } from 'tailwindcss';
import { colors, spacing, typography } from './src/tokens';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    './stories/**/*.{ts,tsx}',
    // Include platform-specific files
    './src/**/*.web.{ts,tsx}',
    './src/**/*.native.{ts,tsx}',
    './src/**/*.ios.{ts,tsx}',
    './src/**/*.android.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          ...colors.brand.primary,
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        platforms: colors.platforms,
      },
      spacing,
      fontFamily: {
        sans: [...typography.fontFamily.sans],
        mono: [...typography.fontFamily.mono],
        display: [...typography.fontFamily.display],
      },
      fontSize: Object.fromEntries(
        Object.entries(typography.fontSize).map(([key, value]) => [key, [...value]])
      ) as any,
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;