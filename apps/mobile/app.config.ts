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
          { scheme: "https", host: webHost, pathPrefix: "/products/" },
          { scheme: "https", host: webHost, pathPrefix: "/collections/" },
          { scheme: "https", host: webHost, path: "/search" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]
  : [];

/**
 * Customer sign-in (SHO-70) returns to `shop.<shop id>.app://callback`, the
 * scheme Shopify requires for native clients. Registered alongside the app's
 * own scheme, and only when the shop id is known.
 */
const shopId = process.env.EXPO_PUBLIC_SHOPIFY_SHOP_ID ?? "";
const schemes = shopId ? ["formulate", `shop.${shopId}.app`] : ["formulate"];

const config: ExpoConfig = {
  name: "Formulate",
  slug: "formulate",
  scheme: schemes,
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.tben140.formulate",
  },
  android: {
    package: "com.tben140.formulate",
    intentFilters: androidAppLinks,
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  plugins: ["expo-router", "expo-web-browser"],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
