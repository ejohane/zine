import { sharedTheme, sharedContent } from '@zine/design-system/tailwind.config.shared';
import { heroui } from '@heroui/theme';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    ...sharedContent,
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
    '../../packages/design-system/dist/web/**/*.{js,ts,jsx,tsx}',
    '../../packages/design-system/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      ...sharedTheme,
      colors: {
        ...sharedTheme.colors,
        // Preserve existing custom colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        'brand-orange': 'var(--brand-orange)',
        'brand-orange-hover': 'var(--brand-orange-hover)',
        'brand-orange-light': 'var(--brand-orange-light)',
        'spotify-green': 'var(--spotify-green)',
        'spotify-green-hover': 'var(--spotify-green-hover)',
        'surface': 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-active': 'var(--surface-active)',
        // Content type colors for gradients
        'video-orange': '#ff6b35',
        'podcast-pink': '#ff69b4',
        'article-blue': '#4a9eff',
        'playlist-gradient-start': '#ff6b35',
        'playlist-gradient-end': '#ff9558',
        'collection-gradient-start': '#ff69b4',
        'collection-gradient-end': '#ffa0c9',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  darkMode: 'class',
  plugins: [
    require("tailwindcss-animate"),
    heroui({
      themes: {
        light: {
          colors: {
            primary: sharedTheme.colors.primary,
            // Map existing brand colors
            warning: '#ff6b35',
            success: '#1DB954',
          },
        },
        dark: {
          colors: {
            primary: sharedTheme.colors.primary,
            // Map existing brand colors
            warning: '#ff6b35',
            success: '#1DB954',
          },
        },
      },
    }),
  ],
};