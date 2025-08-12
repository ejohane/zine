import type { StorybookConfig } from '@storybook/react-vite';
import { resolve } from 'path';

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  addons: [
    '@storybook/addon-onboarding',
    '@storybook/addon-docs',
    '@chromatic-com/storybook'
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(__dirname, '../src'),
    };
    return config;
  },
};

export default config;