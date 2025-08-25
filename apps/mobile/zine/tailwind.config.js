const baseConfig = require('@zine/design-tokens/tailwind.config');

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...baseConfig,
  // NativeWind v4 requires explicit content paths
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./hooks/**/*.{js,jsx,ts,tsx}",
    "./contexts/**/*.{js,jsx,ts,tsx}",
    "../../../packages/ui/src/**/*.{ts,tsx}", // Include UI package
  ],
  presets: [require('nativewind/preset')],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme.extend,
      fontFamily: {
        sans: ['Inter', 'System', 'sans-serif'],
      },
    },
  },
  plugins: [],
};