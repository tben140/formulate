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
  // Account deletion's confirmation (SHO-90).
  "/account/delete",
] as const;

/**
 * Routes one surface has on purpose. Each needs a reason; anything not listed
 * here or in SHARED_ROUTES fails the parity test.
 */
export const SURFACE_ONLY_ROUTES = {
  web: {
    // Legal pages: linked from the footer on web and the theme. The app links
    // out to the web page rather than drawing Shopify's policy HTML.
    "/policies/[handle]": "legal pages, linked from the web footer",
    // Account deletion (SHO-90): the app shows its result in place, and the
    // help page must work for someone without the app (app store rule). The
    // confirm route is a POST handler, not a page.
    "/account/deleted": "where web's deletion form lands; the app shows it in place",
    "/account/delete-help": "public instructions for people without the app",
  },
  mobile: {
    // Not a page: the Cart tab opens the cart sheet (app/(tabs)/_layout.tsx).
    // Web's cart is a drawer with no route either.
    "/cart": "the Cart tab's placeholder; the tab opens a sheet",
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
  ios: "com.tben140.formulate",
  /** app.config.ts `android.package`. */
  android: "com.tben140.formulate",
} as const;
