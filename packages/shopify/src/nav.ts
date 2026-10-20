/**
 * The storefront's navigation, read from a Shopify menu (SHO-60) so the
 * merchant decides what the header links to, not the code.
 *
 * All three surfaces read the same menu: web and mobile through `toNavLinks`,
 * the Liquid theme through its header section's menu setting. Edit it in
 * Shopify admin, Content → Menus.
 */
export const NAV_MENU_HANDLE = "shop";

/** One header link, as an app route rather than a store URL. */
export type NavLink = {
  readonly id: string;
  readonly title: string;
  readonly kind: "collection" | "product";
  readonly handle: string;
  /** The same path on web and mobile: `/collections/<handle>` or `/products/<handle>`. */
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

const ROUTE = /^\/(collections|products)\/([^/?#]+)\/?$/;

/**
 * Keeps the menu items a headless surface can route to, as app paths.
 *
 * Menu URLs are absolute and point at the store's own domain
 * (`https://<shop>.myshopify.com/collections/gut-health`), so only the path is
 * kept. Anything that isn't a single collection or product is dropped rather
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

    const kind = segment === "collections" ? "collection" : "product";
    const handle = decodeURIComponent(rawHandle);
    if (kind === "collection" && RESERVED_COLLECTION_PATHS.has(handle)) return [];

    return [
      { id: item.id, title: item.title, kind, handle, path: `/${segment}/${handle}` },
    ];
  });
