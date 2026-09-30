import { viewedProduct } from "@formulate/analytics";
import { breadcrumbCollection, ProductByHandleQuery } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/add-to-cart-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StorefrontErrorState } from "@/components/storefront-error";
import { TrackViewedProduct } from "@/components/track-viewed-product";
import { getNavLinks } from "@/lib/nav";
import { storefront } from "@/lib/storefront";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

const ProductPage = async ({ params }: PageProps) => {
  const { handle } = await params;

  // The menu is cached per render, so this costs nothing extra: the header
  // has already asked for it.
  const [result, navLinks] = await Promise.all([
    storefront.request(ProductByHandleQuery, { handle }),
    getNavLinks(),
  ]);

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const product = result.data.product;
  if (!product) notFound();

  const collection = breadcrumbCollection(product.breadcrumbCollections.nodes, navLinks);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          ...(collection ? [{ label: collection.title, href: collection.path }] : []),
          { label: product.title },
        ]}
      />
      <article className="grid gap-8 md:grid-cols-2">
        {/*
        Built here, on the server, so the store domain never reaches the client
        bundle — only the emitting needs a browser.
      */}
        <TrackViewedProduct
          payload={viewedProduct(product, process.env.SHOPIFY_STORE_DOMAIN ?? "")}
        />

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
          <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>

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
    </>
  );
};

export { ProductPage as default };
