import {
  nextPageParams,
  previousPageParams,
  type PageInfoLike,
} from "@formulate/shopify";
import Link from "next/link";

/**
 * Previous and Next links for a cursor-paged listing (SHO-44).
 *
 * Plain links, so paging works without JavaScript and each page has a URL.
 * Filters and other parameters carry over; the cursor is replaced. Renders
 * nothing when there's only one page.
 */
export const Pagination = ({
  path,
  params,
  pageInfo,
}: {
  readonly path: string;
  readonly params: URLSearchParams;
  readonly pageInfo: PageInfoLike;
}) => {
  const previous = previousPageParams(params, pageInfo);
  const next = nextPageParams(params, pageInfo);
  if (!previous && !next) return null;

  const link =
    "rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted";

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-between gap-4"
    >
      {previous ? (
        <Link href={`${path}?${previous}`} rel="prev" className={link}>
          ← Previous
        </Link>
      ) : (
        // Keeps Next on the right when there's no Previous.
        <span />
      )}
      {next ? (
        <Link href={`${path}?${next}`} rel="next" className={link}>
          Next →
        </Link>
      ) : null}
    </nav>
  );
};
