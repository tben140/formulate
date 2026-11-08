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
 * Cached ("use cache", tagged `menu:<handle>`, hourly): menus change rarely,
 * and the layout and a page can both need the same menu in one render.
 */
const getMenuLinks = async (handle: string): Promise<NavLink[]> => {
  "use cache";
  cacheTag(`menu:${handle}`);
  const result = await storefront.request(NavMenuQuery, { handle });
  // An outage is returned as "no links" but kept only for a minute, so it's
  // never remembered for hours. Throwing instead would fail prerendering.
  cacheLife(result.ok ? "hours" : "minutes");
  return result.ok ? toNavLinks(result.data.menu?.items) : [];
};

/** The header's collection links. */
export const getNavLinks = () => getMenuLinks(NAV_MENU_HANDLE);

/** The footer's policy links. */
export const getLegalLinks = () => getMenuLinks(LEGAL_MENU_HANDLE);
