import { CollectionProductsQuery, formatMoney } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{collection.title}</h1>
        {collection.description ? (
          <p className="mt-2 max-w-2xl text-foreground-muted">{collection.description}</p>
        ) : null}
      </header>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collection.products.nodes.map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.handle}`}
              className="group block rounded-lg border border-border p-3 transition-colors hover:border-brand-400"
            >
              <div className="mb-3 aspect-square overflow-hidden rounded-md bg-surface-muted">
                {product.featuredImage ? (
                  <Image
                    data={product.featuredImage}
                    sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full items-center justify-center text-sm text-foreground-muted"
                    aria-hidden="true"
                  >
                    No image
                  </div>
                )}
              </div>

              <h2 className="text-base font-medium group-hover:text-brand-700">
                {product.title}
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {formatMoney(product.priceRange.minVariantPrice)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};

export { CollectionPage as default };
