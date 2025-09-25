// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

// Get the default config from @expo/metro-config
const config = getDefaultConfig(__dirname);

// Monorepo setup
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Watch all files in the monorepo - include Expo's defaults
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

// Ensure we're using the same React instance across the monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Apply NativeWind configuration
const { withNativeWind } = require('nativewind/metro');
const finalConfig = withNativeWind(config, { input: './global.css' });

module.exports = finalConfig;