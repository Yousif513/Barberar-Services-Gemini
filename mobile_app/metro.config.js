const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Exclude web_platform build artifacts (.next) and temporary directories from watcher/resolver
config.resolver.blockList = [
  /.*\/web_platform\/\.next\/.*/,
  /.*\/web_platform\/out\/.*/,
  /.*\/web_platform\/build\/.*/,
  /.*\/web_platform\/dist\/.*/,
  /.*\/web_platform\/node_modules\/\.cache\/.*/,
];

module.exports = config;
