// Metro config for pnpm + Turborepo workspace + Expo Router
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from the app first, then fall through to monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. pnpm uses symlinks — Metro must follow them
config.resolver.unstable_enableSymlinks = true;

// 4. Enable package.json "exports" field (needed by some RN libs in SDK 54)
config.resolver.unstable_enablePackageExports = true;

// 5. Do NOT disable hierarchical lookup — pnpm relies on it to resolve hoisted deps
//    (we intentionally do NOT set `disableHierarchicalLookup: true`)

module.exports = config;
