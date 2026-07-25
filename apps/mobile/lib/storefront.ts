import { createStorefrontClient, DEFAULT_API_VERSION } from "@formulate/shopify";

/**
 * The Expo app's Storefront client.
 *
 * EXPO_PUBLIC_* is required here rather than merely convenient: Metro inlines
 * these at bundle time, and the bundle *is* the client. That is exactly what a
 * public Storefront access token is designed for — it is scoped to storefront
 * reads and rate limited per buyer IP. An Admin API token must never appear
 * here.
 */
export const storefront = createStorefrontClient({
  domain: process.env.EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN ?? "",
  token: process.env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? "",
  apiVersion: process.env.EXPO_PUBLIC_SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION,
});
