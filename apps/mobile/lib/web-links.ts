import { paths } from "@formulate/shopify";

/**
 * Links to the web storefront, for sharing (SHO-63).
 *
 * A shared link is the web URL, never `formulate://`: it opens for anyone,
 * app or not, and on Android with App Links set up it reopens the app. The
 * path comes from the shared route contract, so it's the same page.
 *
 * EXPO_PUBLIC_WEB_URL is the web app's origin, e.g. the Vercel production
 * domain. Unset, there's nothing to share and the Share button hides.
 */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/$/, "");

export const webUrl = (path: string): string | null =>
  WEB_URL ? `${WEB_URL}${path}` : null;

export const productWebUrl = (handle: string): string | null =>
  webUrl(paths.product(handle));
