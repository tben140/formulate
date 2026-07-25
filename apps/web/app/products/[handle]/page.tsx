import {
  DEFAULT_COLLECTION_HANDLE,
  ProductByHandleQuery,
  formatMoney,
} from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StorefrontErrorState } from "@/components/storefront-error";
import { storefront } from "@/lib/storefront";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

const ProductPage = async ({ params }: PageProps) => {
  const { handle } = await params;

  const result = await storefront.request(ProductByHandleQuery, { handle });

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const product = result.data.product;
  if (!product) notFound();

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-border bg-surface-muted">
        {product.featuredImage ? (
          <Image
            data={product.featuredImage}
            sizes="(min-width: 768px) 45vw, 90vw"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-square items-center justify-center text-sm text-foreground-muted"
            aria-hidden="true"
          >
            No image
          </div>
        )}
      </div>

      <div>
        <Link
          href={`/collections/${DEFAULT_COLLECTION_HANDLE}`}
          className="text-sm text-brand-600 underline underline-offset-4"
        >
          &larr; Back to collection
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {product.title}
        </h1>

        <p className="mt-2 text-xl text-foreground">
          {formatMoney(product.priceRange.minVariantPrice)}
        </p>

        {product.description ? (
          <p className="mt-4 text-foreground-muted">{product.description}</p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            Variants
          </h2>
          <ul className="mt-3 space-y-2">
            {product.variants.nodes.map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{variant.title}</span>
                <span className="flex items-center gap-3">
                  <span className="text-foreground-muted">
                    {formatMoney(variant.price)}
                  </span>
                  <span
                    className={
                      variant.availableForSale ? "text-success" : "text-danger"
                    }
                  >
                    {variant.availableForSale ? "In stock" : "Sold out"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
};

export { ProductPage as default };
