import {
  LEGAL_MENU_HANDLE,
  NAV_MENU_HANDLE,
  NavMenuQuery,
  toNavLinks,
  type NavLink,
} from "@formulate/shopify";
import { cacheLife, cacheTag } from "next/cache";

import { storefront } from "@/lib/storefront";

/**
 * Links from a Shopify menu (SHO-60), as app paths.
 *
 * A failed or missing menu returns no links rather than an error: the page
 * still works without them, and a navigation outage shouldn't take it down.
 *
 * Wrapped in `cache` because the layout and a page can both need the same menu
 * in one render (the header and a product's breadcrumb), and the Storefront
 * API is POST, which Next doesn't deduplicate by itself.
 */
const fetchMenuLinks = async (handle: string): Promise<NavLink[]> => {
  "use cache";
  // SHO-150 spike: menus change rarely; a menu edit can revalidate the tag.
  cacheLife("hours");
  cacheTag(`menu:${handle}`);
  const result = await storefront.request(NavMenuQuery, { handle });
  // Throw rather than cache an outage as "no links" for hours.
  if (!result.ok) throw new Error(`menu ${handle} unavailable`);
  return toNavLinks(result.data.menu?.items);
};

const getMenuLinks = async (handle: string): Promise<NavLink[]> => {
  try {
    return await fetchMenuLinks(handle);
  } catch {
    return [];
  }
};

/** The header's collection links. */
export const getNavLinks = () => getMenuLinks(NAV_MENU_HANDLE);

/** The footer's policy links. */
export const getLegalLinks = () => getMenuLinks(LEGAL_MENU_HANDLE);
