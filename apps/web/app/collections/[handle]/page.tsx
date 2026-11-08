import type { Metadata } from "next";
import { priorityIndex, SORT_PARAM, withoutEmptyFilters } from "@formulate/shopify";
import { notFound, redirect } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FilteredListing } from "@/components/collection-filters";
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

/**
 * The canonical is always the bare collection URL. Today there is one page of
 * results (see COLLECTION_PAGE_SIZE), so every variant of this URL (tracking
 * parameters, sort parameters) points back to it. When pagination arrives
 * (SHO-44), each page must be its own canonical, not page 1: pointing page 2
 * at page 1 tells search engines to ignore the products only page 2 lists.
 */
export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { handle } = await params;
  const result = await getCollection(handle);
  const collection = result.ok ? result.data.collection : null;
  if (!collection) return {};

  const description = metaDescription(
    collection.seo.description ?? collection.description,
  );

  return {
    title: collection.seo.title ?? collection.title,
    ...(description ? { description } : {}),
    alternates: { canonical: `/collections/${handle}` },
    openGraph: {
      ...baseOpenGraph,
      url: `/collections/${handle}`,
      title: collection.title,
      ...(description ? { description } : {}),
    },
  };
};

const CollectionPage = async ({ params, searchParams }: PageProps) => {
  const { handle } = await params;
  const query = toSearchParams(await searchParams);

  // The filter form submits its empty fields too (an untouched price box), so
  // tidy the URL once: shared links stay readable, and it works without JS.
  const tidy = withoutEmptyFilters(query);
  if (tidy)
    redirect(tidy.size ? `/collections/${handle}?${tidy}` : `/collections/${handle}`);

  const listingQuery = new URLSearchParams(
    [...query].filter(([name]) => name.startsWith("filter.") || name === SORT_PARAM),
  ).toString();
  const result = await getCollection(handle, listingQuery);

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const collection = result.data.collection;
  if (!collection) notFound();
  const firstWithImage = priorityIndex(collection.products.nodes);

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

      <FilteredListing
        filters={collection.products.filters}
        params={query}
        path={`/collections/${handle}`}
        productCount={collection.products.nodes.length}
        // A full page may not be all of them; then the total isn't known.
        total={
          collection.products.nodes.length < COLLECTION_PAGE_SIZE
            ? collection.products.nodes.length
            : null
        }
        sortable
      >
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
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 45vw, 90vw"
                // The LCP image: the first card with a photo (see ProductCard).
                priority={index === firstWithImage}
              />
            </li>
          ))}
        </ul>
      </FilteredListing>
    </>
  );
};

export { CollectionPage as default };
