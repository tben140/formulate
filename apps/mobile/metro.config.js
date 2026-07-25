const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/**
 * Note what is NOT here: watchFolders, resolver.nodeModulesPaths,
 * resolver.disableHierarchicalLookup. Expo SDK 52+ detects the monorepo and
 * configures Metro itself, and setting those manually now causes resolution
 * bugs rather than fixing them.
 */
const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config, { input: "./global.css" });
