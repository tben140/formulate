/**
 * The URL contract shared by web and the app (SHO-63).
 *
 * The same path means the same page everywhere: `/products/whey-protein` is
 * the product on web, and the same path deep-links into the app
 * (`formulate://products/whey-protein`, or an Android App Link to the web
 * domain). Build links with these helpers rather than template strings, and
 * a renamed route can't drift on one surface.
 *
 * `routes.test.ts` reads both apps' route files and fails if either has a page
 * the other lacks, beyond the exceptions declared below.
 */

const segment = (handle: string): string => encodeURIComponent(handle);

export const paths = {
  home: (): string => "/",
  collection: (handle: string): string => `/collections/${segment(handle)}`,
  product: (handle: string): string => `/products/${segment(handle)}`,
  search: (query?: string): string =>
    query ? `/search?${new URLSearchParams({ q: query })}` : "/search",
  policy: (handle: string): string => `/policies/${segment(handle)}`,
  account: (): string => "/account",
  order: (pathId: string): string => `/account/orders/${segment(pathId)}`,
} as const;

/** Route patterns, in Next.js / Expo Router file syntax, that both apps have. */
export const SHARED_ROUTES = [
  "/",
  "/collections/[handle]",
  "/products/[handle]",
  "/search",
  // Customer accounts (SHO-70). Not app links: signed-in pages open where the
  // session is, and a link can't carry one across.
  "/account",
  "/account/orders/[id]",
  // The subscription portal (SHO-72).
  "/account/subscriptions",
  "/account/subscriptions/[id]",
  // The app has drawn the store's policies itself since #166.
  "/policies/[handle]",
] as const;

/**
 * Routes one surface has on purpose. Each needs a reason; anything not listed
 * here or in SHARED_ROUTES fails the parity test.
 */
export const SURFACE_ONLY_ROUTES = {
  web: {},
  mobile: {
    // Not a page: the Cart tab opens the cart sheet (app/(tabs)/_layout.tsx).
    // Web's cart is a drawer with no route either.
    "/cart": "the Cart tab's placeholder; the tab opens a sheet",
    // Not a page: where Shopify's sign-in returns. The sign-in sheet reads the
    // URL; this only stops Android's router showing "unmatched route" for it.
    // Web's equivalent is a route handler (/account/authorize).
    "/callback": "the sign-in return URL, redirecting to the account tab",
  },
} as const;

/**
 * The paths an Android App Link (and later an iOS Universal Link) should open
 * in the app: the shared routes, as URL path patterns.
 */
export const APP_LINK_PATHS = ["/", "/collections/*", "/products/*", "/search"] as const;

/** The app's identifiers, needed by the well-known files web serves. */
export const APP_IDENTIFIERS = {
  /** app.config.ts `ios.bundleIdentifier`. */
  ios: "com.tben140.doublehelix",
  /** app.config.ts `android.package`. */
  android: "com.tben140.doublehelix",
} as const;
