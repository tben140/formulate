/**
 * The storefront's navigation, read from a Shopify menu (SHO-60) so the
 * merchant decides what the header links to, not the code.
 *
 * All three surfaces read the same menu: web and mobile through `toNavLinks`,
 * the Liquid theme through its header section's menu setting. Edit it in
 * Shopify admin, Content → Menus.
 */
export const NAV_MENU_HANDLE = "shop";

/** The footer's policy links (Content → Menus → Legal). */
export const LEGAL_MENU_HANDLE = "legal";

/** One header link, as an app route rather than a store URL. */
export type NavLink = {
  readonly id: string;
  readonly title: string;
  readonly kind: "collection" | "product" | "policy";
  readonly handle: string;
  /**
   * The app path: `/collections/<handle>`, `/products/<handle>` or
   * `/policies/<handle>`. Web routes all three; mobile has no policy screen,
   * so it keeps only the first two.
   */
  readonly path: string;
};

type MenuItemLike = {
  readonly id: string;
  readonly title: string;
  readonly url?: string | null;
};

/**
 * Shopify's own collection routes that aren't collections: `all` (the whole
 * catalogue), and the vendor and product-type listings. The Storefront API has
 * no collection behind any of them.
 */
const RESERVED_COLLECTION_PATHS = new Set(["all", "vendors", "types"]);

/**
 * The store policies the Storefront API can return, by the handle Shopify
 * gives each in its `/policies/<handle>` URL. Anything else under `/policies/`
 * has no content behind it here.
 */
export const POLICY_HANDLES = [
  "privacy-policy",
  "refund-policy",
  "terms-of-service",
  "shipping-policy",
  "subscription-policy",
] as const;

export type PolicyHandle = (typeof POLICY_HANDLES)[number];

export const isPolicyHandle = (handle: string): handle is PolicyHandle =>
  (POLICY_HANDLES as readonly string[]).includes(handle);

const KINDS = {
  collections: "collection",
  products: "product",
  policies: "policy",
} as const;

const ROUTE = /^\/(collections|products|policies)\/([^/?#]+)\/?$/;

/**
 * Keeps the menu items a headless surface can route to, as app paths.
 *
 * Menu URLs are absolute and point at the store's own domain
 * (`https://<shop>.myshopify.com/collections/gut-health`), so only the path is
 * kept. Anything that isn't a single collection, product or store policy is
 * dropped rather
 * than linked to a page that doesn't exist here: the home page (the wordmark
 * already links there), Shopify's reserved collection routes, pages, blogs,
 * policies, search and external links.
 */
export const toNavLinks = (
  items: readonly MenuItemLike[] | null | undefined,
): NavLink[] =>
  (items ?? []).flatMap((item) => {
    if (!item.url) return [];

    let path: string;
    try {
      // The base only matters for relative URLs; absolute ones ignore it.
      path = new URL(item.url, "https://store.invalid").pathname;
    } catch {
      return [];
    }

    const [, segment, rawHandle] = ROUTE.exec(path) ?? [];
    if (!segment || !rawHandle) return [];

    const kind = KINDS[segment as keyof typeof KINDS];
    const handle = decodeURIComponent(rawHandle);
    if (kind === "collection" && RESERVED_COLLECTION_PATHS.has(handle)) return [];
    if (kind === "policy" && !isPolicyHandle(handle)) return [];

    return [
      { id: item.id, title: item.title, kind, handle, path: `/${segment}/${handle}` },
    ];
  });

/**
 * The collection a product's breadcrumb goes through: the first navigation
 * link, in menu order, that the product belongs to.
 *
 * A product sits in several collections, and a product URL doesn't say which
 * one the shopper came from. Menu order makes the choice deterministic and
 * merchant-controlled, and only ever links to a collection the header offers.
 * Null when the product is in none of them; the trail is then Home › Product.
 */
export const breadcrumbCollection = (
  productCollections: readonly { readonly handle: string }[],
  navLinks: readonly NavLink[],
): NavLink | null => {
  const handles = new Set(productCollections.map((collection) => collection.handle));
  return (
    navLinks.find((link) => link.kind === "collection" && handles.has(link.handle)) ??
    null
  );
};
