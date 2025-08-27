// Import tokens from compiled JS files
const { colors } = require('./src/colors.js');
const { spacing } = require('./src/spacing.js');
const { typography } = require('./src/typography.js');
const { breakpoints } = require('./src/breakpoints.js');
const { shadows } = require('./src/shadows.js');
const { borderRadius, borderWidth } = require('./src/borders.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    screens: breakpoints,
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: colors.neutral[0],
      black: colors.neutral[1000],
      
      // Brand colors
      primary: colors.brand.primary,
      secondary: colors.brand.secondary,
      
      // Neutral colors
      gray: colors.neutral,
      neutral: colors.neutral,
      
      // Semantic colors
      success: colors.semantic.success,
      warning: colors.semantic.warning,
      error: colors.semantic.error,
      danger: colors.semantic.error, // Alias
      info: colors.semantic.info,
      
      // Platform colors
      spotify: colors.platforms.spotify,
      youtube: colors.platforms.youtube,
      apple: colors.platforms.apple,
      google: colors.platforms.google,
      rss: colors.platforms.rss,
      podcast: colors.platforms.podcast,
      
      // Functional colors
      background: colors.backgrounds,
      text: colors.text,
      border: colors.borders,
    },
    spacing,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    letterSpacing: typography.letterSpacing,
    lineHeight: typography.lineHeight,
    borderRadius,
    borderWidth,
    boxShadow: shadows,
    extend: {
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      transitionDuration: {
        '2000': '2000ms',
        '3000': '3000ms',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  plugins: [],
};