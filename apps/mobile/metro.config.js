const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/**
 * Note what is NOT here: watchFolders, resolver.nodeModulesPaths,
 * resolver.disableHierarchicalLookup. Expo SDK 52+ detects the monorepo and
 * configures Metro itself, and setting those manually now causes resolution
 * bugs rather than fixing them.
 */
const config = getDefaultConfig(__dirname);

const withCss = withNativewind(config, { input: "./global.css" });

/*
 * ⚠️ react-native-css (NativeWind's runtime) redirects every `react-native`
 * import, node_modules included, to its own stand-in so `className` works on
 * the core components. Its 3.1.0-rc.0 stand-in has no `AssetRegistry`, which
 * expo-asset reads to load fonts and icons, so under SDK 58 every icon font
 * failed ("Cannot read property 'getAssetByID' of undefined"). expo-asset
 * renders nothing with a className, so it gets the real module. Remove once
 * react-native-css passes AssetRegistry through.
 */
const cssResolveRequest = withCss.resolver.resolveRequest;
withCss.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native" &&
    /[\\/]expo-asset[\\/]/.test(context.originModulePath)
  ) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return cssResolveRequest
    ? cssResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withCss;
