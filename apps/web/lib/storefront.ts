import { createStorefrontClient, DEFAULT_API_VERSION } from "@formulate/shopify";

/**
 * The web app's Storefront client.
 *
 * These env vars are intentionally NOT prefixed NEXT_PUBLIC_: every query in
 * this app runs in a Server Component, so the token never needs to reach the
 * browser. The Expo app uses EXPO_PUBLIC_* because its bundle *is* the client.
 */
export const storefront = createStorefrontClient({
  domain: process.env.SHOPIFY_STORE_DOMAIN ?? "",
  token: process.env.SHOPIFY_STOREFRONT_TOKEN ?? "",
  apiVersion: process.env.SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION,
});
