import type { ExpoConfig } from "expo/config";

/**
 * app.config.ts rather than app.json so the config can read from the
 * environment — EAS injects EXPO_PUBLIC_* vars at build time, and a static
 * JSON file cannot pick them up.
 */
/**
 * Android App Links (SHO-63): product, collection and search URLs on the web
 * domain open in the app. `autoVerify` makes Android check the domain's
 * /.well-known/assetlinks.json (served by apps/web) and skip the "open with"
 * prompt; until that file exists, Android asks instead. Declared only when
 * EXPO_PUBLIC_WEB_URL names the domain. The paths match APP_LINK_PATHS in
 * packages/shopify routes.ts.
 */
const webHost = (() => {
  try {
    return new URL(process.env.EXPO_PUBLIC_WEB_URL ?? "").host;
  } catch {
    return "";
  }
})();

const androidAppLinks = webHost
  ? [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: webHost, path: "/" },
          { scheme: "https", host: webHost, pathPrefix: "/products/" },
          { scheme: "https", host: webHost, pathPrefix: "/collections/" },
          { scheme: "https", host: webHost, path: "/search" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]
  : [];

const config: ExpoConfig = {
  // The name on the home screen and in TestFlight (#96 makes the same change
  // on the batch; the brand is Double Helix).
  name: "Double Helix",
  slug: "formulate",
  scheme: "formulate",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    // ⚠️ Permanent once the first build is uploaded to App Store Connect.
    // Shoppers never see it; the display name is `name` above.
    bundleIdentifier: "com.tben140.doublehelix",
    // iOS universal links, the twin of `androidAppLinks`: product, collection
    // and search URLs on the web domain open in the app. iOS checks the
    // domain's /.well-known/apple-app-site-association (served by apps/web,
    // which needs APPLE_TEAM_ID). Needs a paid Apple developer account.
    ...(webHost ? { associatedDomains: [`applinks:${webHost}`] } : {}),
    config: {
      // The app only uses standard HTTPS, which is exempt from US export
      // rules. Saying so here skips App Store Connect's encryption question
      // on every TestFlight upload.
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.tben140.doublehelix",
    intentFilters: androidAppLinks,
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: ["expo-router"],
  experiments: {
    typedRoutes: true,
  },
  // The EAS project (@tben140/formulate), from `eas init` on 2026-10-20. Not a
  // secret: it names the project, it grants nothing. EAS_PROJECT_ID can
  // still override it, e.g. for a fork with its own project.
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "a9820ed7-2f31-472f-b472-5a7f5545b16e",
    },
  },
};

export default config;
