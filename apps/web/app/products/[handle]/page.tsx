import { productViewedProperties, viewedProduct } from "@formulate/analytics";
import { breadcrumbCollection } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToCartForm } from "@/components/add-to-cart-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PairsWellWith } from "@/components/pairs-well-with";
import { StorefrontErrorState } from "@/components/storefront-error";
import { TrackViewedProduct } from "@/components/track-viewed-product";
import { getProduct } from "@/lib/catalogue";
import { getNavLinks } from "@/lib/nav";
import { baseOpenGraph } from "@/lib/site";
import { breadcrumbJsonLd, metaDescription, productJsonLd } from "@/lib/structured-data";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

/**
 * The merchant's SEO overrides win; the product's own title and description
 * are the fallback. A failed query or missing product returns nothing here and
 * lets the page render its error or 404, which carry their own titles.
 */
export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { handle } = await params;
  const result = await getProduct(handle);
  const product = result.ok ? result.data.product : null;
  if (!product) return {};

  const description = metaDescription(product.seo.description ?? product.description);
  const image = product.featuredImage;

  return {
    title: product.seo.title ?? product.title,
    ...(description ? { description } : {}),
    // Relative, resolved against metadataBase. Query strings are dropped on
    // purpose: tracking parameters must not create duplicate URLs.
    alternates: { canonical: `/products/${product.handle}` },
    openGraph: {
      ...baseOpenGraph,
      url: `/products/${product.handle}`,
      title: product.title,
      ...(description ? { description } : {}),
      ...(image
        ? {
            images: [
              {
                url: image.url,
                ...(image.width ? { width: image.width } : {}),
                ...(image.height ? { height: image.height } : {}),
                alt: image.altText ?? product.title,
              },
            ],
          }
        : {}),
    },
  };
};

const ProductPage = async ({ params }: PageProps) => {
  const { handle } = await params;

  // Both cached per render: generateMetadata already fetched the product, and
  // the header the menu.
  const [result, navLinks] = await Promise.all([getProduct(handle), getNavLinks()]);

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const product = result.data.product;
  if (!product) notFound();

  // The same trail for people and for search engines.
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
        <JsonLd data={productJsonLd(product)} />
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Home", path: "/" },
            ...(collection ? [{ name: collection.title, path: collection.path }] : []),
            { name: product.title, path: `/products/${product.handle}` },
          ])}
        />

        {/*
        Built here, on the server, so the store domain never reaches the client
        bundle — only the emitting needs a browser.
      */}
        <TrackViewedProduct
          payload={viewedProduct(product, process.env.SHOPIFY_STORE_DOMAIN ?? "")}
          productViewed={productViewedProperties(product)}
        />

        <div className="overflow-hidden rounded-lg border border-border bg-surface-muted">
          {product.featuredImage ? (
            <Image
              data={product.featuredImage}
              sizes="(min-width: 768px) 45vw, 90vw"
              className="h-full w-full object-cover"
              // The page's Largest Contentful Paint. Hydrogen's Image defaults
              // to lazy, which made the browser wait for layout before even
              // requesting it (SHO-143).
              loading="eager"
              fetchPriority="high"
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

          {/* No fallback: nothing at all is better than a loading box here. */}
          <Suspense fallback={null}>
            <PairsWellWith productId={product.id} />
          </Suspense>
        </div>
      </article>
    </>
  );
};

export { ProductPage as default };
