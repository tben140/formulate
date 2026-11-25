// ⚠️ A TypeScript import in the Expo config. Expo loads this file through
// Node, and Node runs the .ts it imports only from 22.18, when type stripping
// became the default; hence the root package.json's engines field. On an older
// Node, `expo start` and builds fail here before reading the config.
// app.config.ts can't load the package index (its generated types), so the
// route contract comes from its own entry point.
import { APP_IDENTIFIERS, APP_LINK_PATHS } from "@formulate/shopify/routes";
import { BRAND_NAME } from "@formulate/tokens";
import type { ExpoConfig } from "expo/config";

/**
 * The site whose product and collection links open the app (universal links
 * on iOS, App Links on Android). The site serves the matching files under
 * `/.well-known/` (apps/web/lib/app-links.ts), which must claim the same paths.
 * Until those files exist, links open in the browser as before. The claimed
 * paths are APP_LINK_PATHS (packages/shopify routes.ts), the same list web
 * serves.
 */
const APP_LINK_HOST = "www.doublehelixsupplements.co.uk";

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
    bundleIdentifier: APP_IDENTIFIERS.ios,
    associatedDomains: [`applinks:${APP_LINK_HOST}`],
  },
  android: {
    package: APP_IDENTIFIERS.android,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        // APP_LINK_PATHS as Android data: exact paths, and prefixes for `/*`.
        data: APP_LINK_PATHS.map((pattern) =>
          pattern.endsWith("/*")
            ? { scheme: "https", host: APP_LINK_HOST, pathPrefix: pattern.slice(0, -1) }
            : { scheme: "https", host: APP_LINK_HOST, path: pattern },
        ),
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
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
