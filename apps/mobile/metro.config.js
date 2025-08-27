const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Ensure we're using the same React instance across the monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force Metro to resolve these packages from the root to avoid duplicates
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName === 'react-native') {
    return {
      filePath: require.resolve(moduleName, {
        paths: [workspaceRoot],
      }),
      type: 'sourceFile',
    };
  }
  
  // Default resolution for other modules
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;