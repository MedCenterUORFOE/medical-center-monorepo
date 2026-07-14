const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

const appNodeModules = path.resolve(projectRoot, 'node_modules');

const FORCE_APP_LEVEL = [
  'react',
  'react-native',
  'react-dom',
  'scheduler',
  '@react-navigation/core',
  '@react-navigation/native',
  '@react-navigation/elements',
  '@react-navigation/bottom-tabs',
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkgName = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];

  if (FORCE_APP_LEVEL.includes(pkgName)) {
    try {
      return {
        filePath: require.resolve(
          moduleName.replace(pkgName, path.join(appNodeModules, pkgName))
        ),
        type: 'sourceFile',
      };
    } catch (_e) {
      // fallback to default if not found at app level
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;