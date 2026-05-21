// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          paths: ['../../node_modules'],
        },
      },
    },
    ignores: ['dist/*', '.rnstorybook/storybook.requires.ts', 'uniwind-types.d.ts'],
  },
]);
