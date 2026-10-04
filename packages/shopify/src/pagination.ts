/**
 * Cursor pagination for product connections (SHO-43), shared so web and mobile
 * page identically.
 *
 * Web keeps the position in the URL (`?after=<cursor>` or `?before=<cursor>`),
 * so a page of results is a link that works without JavaScript. Mobile pages
 * forward only (infinite scroll) and uses `nextCursor`.
 *
 * ⚠️ Not the theme's URL. Liquid paginates by number (`?page=2`); the
 * Storefront API has no page numbers, only cursors, so a numbered link can't
 * be resolved without walking every page before it. The two formats coexist:
 * the filter helpers clear `page`, `after` and `before` alike when a filter
 * changes, so a filtered listing always restarts from its first page.
 */

/** What the API reports about the page it returned. */
export type PageInfoLike = {
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly startCursor?: string | null;
  readonly endCursor?: string | null;
};

export type PageVariables =
  | { readonly first: number; readonly after?: string }
  | { readonly last: number; readonly before: string };

/**
 * Cursors are opaque base64-ish strings from Shopify. Anything else in the URL
 * is someone's typo or a stale link, and is ignored rather than sent: the API
 * rejects a malformed cursor, which would turn a bad link into an error page.
 */
const isCursor = (value: string | null): value is string =>
  value !== null &&
  value.length > 0 &&
  value.length <= 512 &&
  /^[A-Za-z0-9+/=_-]+$/.test(value);

/** The connection arguments a query string asks for. `before` wins over `after`. */
export const pageVariables = (params: URLSearchParams, size: number): PageVariables => {
  const before = params.get("before");
  if (isCursor(before)) return { last: size, before };
  const after = params.get("after");
  return isCursor(after) ? { first: size, after } : { first: size };
};

const withCursor = (
  params: URLSearchParams,
  name: "after" | "before",
  cursor: string,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const key of ["after", "before", "page"]) next.delete(key);
  next.set(name, cursor);
  return next;
};

/** The query string for the next page, or null on the last one. */
export const nextPageParams = (
  params: URLSearchParams,
  pageInfo: PageInfoLike,
): URLSearchParams | null =>
  pageInfo.hasNextPage && pageInfo.endCursor
    ? withCursor(params, "after", pageInfo.endCursor)
    : null;

/**
 * The query string for the previous page, or null on the first one.
 *
 * Page one reached by going back keeps a `?before=` cursor: the API can't say
 * in advance that the previous page is the first, so its URL differs from the
 * bare collection URL while showing the same products.
 */
export const previousPageParams = (
  params: URLSearchParams,
  pageInfo: PageInfoLike,
): URLSearchParams | null => {
  if (!pageInfo.hasPreviousPage || !pageInfo.startCursor) return null;
  return withCursor(params, "before", pageInfo.startCursor);
};

/** For infinite scroll: the cursor to load next, or undefined when done. */
export const nextCursor = (pageInfo: PageInfoLike): string | undefined =>
  pageInfo.hasNextPage && pageInfo.endCursor ? pageInfo.endCursor : undefined;
