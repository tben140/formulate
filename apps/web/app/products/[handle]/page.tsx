import { DEFAULT_COLLECTION_HANDLE, ProductByHandleQuery } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/add-to-cart-form";
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

        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{product.title}</h1>

        {product.description ? (
          <p className="mt-4 text-foreground-muted">{product.description}</p>
        ) : null}

        {/*
          The price now lives inside the form, because it changes with the
          selection — a subscription plan carries its own adjusted price, and
          showing the product's `minVariantPrice` alongside it would contradict
          whatever the shopper had chosen.
        */}
        <AddToCartForm product={product} />
      </div>
    </article>
  );
};

export { ProductPage as default };
