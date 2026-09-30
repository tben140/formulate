import { CollectionProductsQuery } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { storefront } from "@/lib/storefront";

interface PageProps {
  /** Next 15+ passes route params as a Promise. */
  readonly params: Promise<{ handle: string }>;
}

export const metadata: Metadata = { title: "Collection — Formulate" };

const CollectionPage = async ({ params }: PageProps) => {
  const { handle } = await params;

  const result = await storefront.request(CollectionProductsQuery, {
    handle,
    first: 24,
  });

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const collection = result.data.collection;
  if (!collection) notFound();

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: collection.title }]} />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{collection.title}</h1>
        {collection.description ? (
          <p className="mt-2 max-w-2xl text-foreground-muted">{collection.description}</p>
        ) : null}
      </header>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collection.products.nodes.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export { CollectionPage as default };
