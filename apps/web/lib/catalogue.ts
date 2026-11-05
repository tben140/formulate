import {
  CollectionProductsQuery,
  pageVariables,
  productFiltersFromParams,
  ProductByHandleQuery,
} from "@formulate/shopify";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * Per-request memoised loaders.
 *
 * A route's `generateMetadata` and its page both need the same product. The
 * Storefront client POSTs, and Next only dedupes GET fetches, so without this
 * every product page would query Shopify twice for identical data. `cache`
 * scopes the memo to one server request, so nothing is shared between
 * shoppers.
 */
export const getProduct = cache(async (handle: string) =>
  storefront.request(ProductByHandleQuery, { handle }),
);

/** Products per page, the same as the theme's `paginate ... by 24`. */
export const COLLECTION_PAGE_SIZE = 24;

/**
 * `filterQuery` is the Liquid-style filter query string (SHO-153) and
 * `pageQuery` the cursor (`after=…` or `before=…`, SHO-44). Strings, not
 * parsed values, so React's per-render cache can match them.
 */
export const getCollection = cache(
  async (handle: string, filterQuery = "", pageQuery = "") =>
    storefront.request(CollectionProductsQuery, {
      handle,
      ...pageVariables(new URLSearchParams(pageQuery), COLLECTION_PAGE_SIZE),
      filters: productFiltersFromParams(new URLSearchParams(filterQuery)),
    }),
);
