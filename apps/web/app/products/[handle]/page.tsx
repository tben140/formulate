import { productViewedProperties, viewedProduct } from "@formulate/analytics";
import { EXPERIMENTS } from "@formulate/experiments";
import { breadcrumbCollection, galleryImages } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToCartForm } from "@/components/add-to-cart-form";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ExperimentExposure } from "@/components/experiment-exposure";
import { JsonLd } from "@/components/json-ld";
import { PairsWellWith } from "@/components/pairs-well-with";
import { ProductGallery } from "@/components/product-gallery";
import { ShareButton } from "@/components/share-button";
import { StoreHtml } from "@/components/store-html";
import { StorefrontErrorState } from "@/components/storefront-error";
import { TrackViewedProduct } from "@/components/track-viewed-product";
import { getProduct } from "@/lib/catalogue";
import { assignExperiment } from "@/lib/experiments";
import { getNavLinks, getShopGroups } from "@/lib/nav";
import { absoluteUrl, baseOpenGraph, siteUrl } from "@/lib/site";
import { breadcrumbJsonLd, metaDescription, productJsonLd } from "@/lib/structured-data";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

interface ProductPageProps extends PageProps {
  /** Only read to force an experiment's variant for review (lib/experiments.ts). */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
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

const ProductPage = async ({ params, searchParams }: ProductPageProps) => {
  const { handle } = await params;
  const aa = EXPERIMENTS.productPageAa;

  // Both cached per render: generateMetadata already fetched the product, and
  // the header the menu.
  const [result, navLinks, shopGroups, aaAssignment] = await Promise.all([
    getProduct(handle),
    getNavLinks(),
    getShopGroups(),
    // The A/A test (ADR 0013): both arms render this same page, so only the
    // exposure below depends on it.
    searchParams.then((query) => assignExperiment(aa, query[aa.key])),
  ]);

  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const product = result.data.product;
  if (!product) notFound();

  // The same trail for people and for search engines.
  // The Shop dropdown's groups first (a goal says more than "Best Sellers"),
  // then the bar's links, so a product in neither still gets one if it can.
  const collection = breadcrumbCollection(product.breadcrumbCollections.nodes, [
    ...shopGroups.flatMap((group) => group.links),
    ...navLinks,
  ]);

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
        {aaAssignment.exposure && aaAssignment.visitorId ? (
          <ExperimentExposure
            exposure={aaAssignment.exposure}
            visitorId={aaAssignment.visitorId}
          />
        ) : null}

        <TrackViewedProduct
          payload={viewedProduct(product, siteUrl.origin)}
          productViewed={productViewedProperties(product)}
        />

        {/*
          `self-start`: a grid cell stretches to the row's height, and the
          details column is far taller than the photo, so the image grew to
          350 × 961 at 768 px and was cropped to fit. Now it keeps the photo's
          own shape, and on two columns it stays in view while the details
          scroll past.
        */}
        <div className="self-start md:sticky md:top-6">
          <ProductGallery images={galleryImages(product)} title={product.title} />
        </div>

        <div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
            <ShareButton
              url={absoluteUrl(`/products/${product.handle}`)}
              title={product.title}
            />
          </div>
          {product.subtitle?.value ? (
            <p className="mt-2 text-lg text-foreground-muted">{product.subtitle.value}</p>
          ) : null}

          {product.descriptionHtml ? (
            // Its first paragraph's own top margin spaces it from the title.
            <StoreHtml html={product.descriptionHtml} />
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
