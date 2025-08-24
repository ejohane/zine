const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Tamagui configuration
config.resolver.sourceExts.push('mjs')

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

module.exports = config