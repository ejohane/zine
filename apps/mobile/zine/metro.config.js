const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Monorepo configuration
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../../..')

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Ensure shared packages are resolved correctly
config.resolver.extraNodeModules = {
  '@zine/shared': path.resolve(workspaceRoot, 'packages/shared'),
}

// NativeWind v4 configuration
module.exports = withNativeWind(config, {
  input: './src/styles/global.css',
  configPath: './tailwind.config.js',
})