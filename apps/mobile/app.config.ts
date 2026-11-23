import type { ExpoConfig } from "expo/config";

/**
 * app.config.ts rather than app.json so the config can read from the
 * environment — EAS injects EXPO_PUBLIC_* vars at build time, and a static
 * JSON file cannot pick them up.
 */
const config: ExpoConfig = {
  name: "Double Helix",
  slug: "formulate",
  scheme: "formulate",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/brand/app-icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.tben140.formulate",
  },
  android: {
    package: "com.tben140.formulate",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/android-foreground.png",
      monochromeImage: "./assets/brand/android-monochrome.png",
      backgroundColor: "#20282B",
    },
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/splash-mark.png",
        imageWidth: 170,
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
