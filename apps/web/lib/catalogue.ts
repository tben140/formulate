import {
  collectionSort,
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
/**
 * `listingQuery` is the Liquid-style filter and sort query string (SHO-153):
 * `filter.*` parameters and `sort_by`. `pageQuery` is the cursor (`after=…` or
 * `before=…`, SHO-44). Strings, not the parsed values, so React's per-render
 * cache can match them.
 */
export const getCollection = cache(
  async (handle: string, listingQuery = "", pageQuery = "") => {
    const params = new URLSearchParams(listingQuery);
    const { sortKey, reverse } = collectionSort(params);
    return storefront.request(CollectionProductsQuery, {
      handle,
      ...pageVariables(new URLSearchParams(pageQuery), COLLECTION_PAGE_SIZE),
      filters: productFiltersFromParams(params),
      sortKey,
      reverse,
    });
  },
);
