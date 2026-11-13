// ⚠️ A TypeScript import in the Expo config. Expo loads this file through
// Node, and Node runs the .ts it imports only from 22.18, when type stripping
// became the default; hence the root package.json's engines field. On an older
// Node, `expo start` and builds fail here before reading the config.
import { BRAND_NAME } from "@formulate/tokens";
import type { ExpoConfig } from "expo/config";

/**
 * app.config.ts rather than app.json so the config can read from the
 * environment — EAS injects EXPO_PUBLIC_* vars at build time, and a static
 * JSON file cannot pick them up.
 */
const config: ExpoConfig = {
  name: BRAND_NAME,
  slug: "formulate",
  scheme: "formulate",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.tben140.formulate",
  },
  android: {
    package: "com.tben140.formulate",
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: ["expo-router"],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
