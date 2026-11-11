import {
  LEGAL_MENU_HANDLE,
  NAV_MENU_HANDLE,
  NavMenuQuery,
  SHOP_MENU_HANDLES,
  toNavGroup,
  toNavLinks,
  type NavGroup,
  type NavLink,
} from "@formulate/shopify";
import { cache } from "react";

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
const getMenuLinks = cache(async (handle: string): Promise<NavLink[]> => {
  const result = await storefront.request(NavMenuQuery, { handle });
  return result.ok ? toNavLinks(result.data.menu?.items) : [];
});

/** The header's collection links. */
export const getNavLinks = () => getMenuLinks(NAV_MENU_HANDLE);

/** The footer's policy links. */
export const getLegalLinks = () => getMenuLinks(LEGAL_MENU_HANDLE);

/**
 * The header's Shop dropdown: a group per menu in SHOP_MENU_HANDLES, in that
 * order, leaving out any that failed or have no links. Like the links above,
 * a failure costs the dropdown, not the page.
 */
export const getShopGroups = cache(async (): Promise<NavGroup[]> => {
  const results = await Promise.all(
    SHOP_MENU_HANDLES.map((handle) => storefront.request(NavMenuQuery, { handle })),
  );
  return results.flatMap((result) =>
    result.ok ? (toNavGroup(result.data.menu) ?? []) : [],
  );
});
