import type { Metadata } from "next";
import { pageVariables, withoutEmptyFilters } from "@formulate/shopify";
import { notFound, redirect } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CollectionFilters } from "@/components/collection-filters";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { COLLECTION_PAGE_SIZE, getCollection } from "@/lib/catalogue";
import { toSearchParams } from "@/lib/search-params";
import { baseOpenGraph } from "@/lib/site";
import { breadcrumbJsonLd, metaDescription } from "@/lib/structured-data";

interface PageProps {
  /** Next 15+ passes route params as a Promise. */
  readonly params: Promise<{ handle: string }>;
  /** The filters, in the Liquid theme's format (see packages/shopify filters.ts). */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The filter part of a query string (`filter.…`), for the loader. */
const filterQueryOf = (query: URLSearchParams): string =>
  new URLSearchParams(
    [...query].filter(([name]) => name.startsWith("filter.")),
  ).toString();

/**
 * The cursor part of a query string (`after=…` or `before=…`), and nothing
 * else: what tells one page of a collection from another.
 */
const pageQueryOf = (query: URLSearchParams): string => {
  const variables = pageVariables(query, COLLECTION_PAGE_SIZE);
  if ("before" in variables)
    return new URLSearchParams({ before: variables.before }).toString();
  return variables.after
    ? new URLSearchParams({ after: variables.after }).toString()
    : "";
};

/**
 * Each page is its own canonical (SHO-44): the bare collection URL for the
 * first page, plus the cursor for later ones. Pointing page 2 at page 1 would
 * tell search engines to ignore the products only page 2 lists. Everything
 * else in the URL (filters, tracking) is left out, so those variants point
 * back to the unfiltered page.
 */
export const generateMetadata = async ({
  params,
  searchParams,
}: PageProps): Promise<Metadata> => {
  const { handle } = await params;
  const query = toSearchParams(await searchParams);
  const pageQuery = pageQueryOf(query);
  const canonical = pageQuery
    ? `/collections/${handle}?${pageQuery}`
    : `/collections/${handle}`;
  // The same arguments as the page, so React's cache serves both from one
  // request.
  const result = await getCollection(handle, filterQueryOf(query), pageQuery);
  const collection = result.ok ? result.data.collection : null;
  if (!collection) return {};

  const description = metaDescription(
    collection.seo.description ?? collection.description,
  );

  return {
    title: collection.seo.title ?? collection.title,
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: {
      ...baseOpenGraph,
      url: canonical,
      title: collection.title,
      ...(description ? { description } : {}),
    },
  };
};

/** Products per row at the widest breakpoint (`lg:grid-cols-3`). */
const FIRST_ROW = 3;

const CollectionPage = async ({ params, searchParams }: PageProps) => {
  const { handle } = await params;
  const query = toSearchParams(await searchParams);

  // The filter form submits its empty fields too (an untouched price box), so
  // tidy the URL once: shared links stay readable, and it works without JS.
  const tidy = withoutEmptyFilters(query);
  if (tidy)
    redirect(tidy.size ? `/collections/${handle}?${tidy}` : `/collections/${handle}`);

  const result = await getCollection(handle, filterQueryOf(query), pageQueryOf(query));

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const collection = result.data.collection;
  if (!collection) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: collection.title, path: `/collections/${handle}` },
        ])}
      />

      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: collection.title }]} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{collection.title}</h1>
        {collection.description ? (
          <p className="mt-2 max-w-2xl text-foreground-muted">{collection.description}</p>
        ) : null}
      </header>

      <CollectionFilters
        filters={collection.products.filters}
        params={query}
        path={`/collections/${handle}`}
        productCount={collection.products.nodes.length}
      />

      {collection.products.nodes.length === 0 ? (
        <p className="py-12 text-center text-foreground-muted">
          No products match these filters.
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collection.products.nodes.map((product, index) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
              // The first row is on screen at load, and its first image is the
              // Largest Contentful Paint on a phone. Hydrogen's Image defaults
              // to lazy, which delayed it (SHO-143). Three is the widest row;
              // everything below stays lazy.
              loading={index < FIRST_ROW ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
          </li>
        ))}
      </ul>

      <Pagination
        path={`/collections/${handle}`}
        params={query}
        pageInfo={collection.products.pageInfo}
      />
    </>
  );
};

export { CollectionPage as default };
