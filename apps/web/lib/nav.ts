import {
  NAV_MENU_HANDLE,
  NavMenuQuery,
  toNavLinks,
  type NavLink,
} from "@formulate/shopify";

import { storefront } from "@/lib/storefront";

/**
 * The header's links, from the Shopify menu (SHO-60).
 *
 * A failed or missing menu returns no links rather than an error: the header
 * still has the wordmark and cart, and a navigation outage shouldn't take the
 * page down with it.
 */
export const getNavLinks = async (): Promise<NavLink[]> => {
  const result = await storefront.request(NavMenuQuery, { handle: NAV_MENU_HANDLE });
  return result.ok ? toNavLinks(result.data.menu?.items) : [];
};
