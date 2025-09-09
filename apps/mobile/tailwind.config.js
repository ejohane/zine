const { sharedTheme } = require('@zine/design-system/tailwind.config.shared');

module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/heroui-native/lib/**/*.{js,ts,jsx,tsx}',
    '../../packages/design-system/dist/native/**/*.{js,ts,jsx,tsx}',
    '../../packages/design-system/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      ...sharedTheme,
      colors: {
        ...sharedTheme.colors,
        // Additional mobile-specific colors if needed
      },
    },
  },
  plugins: [],
};