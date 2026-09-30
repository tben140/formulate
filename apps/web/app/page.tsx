import { CollectionCardsQuery, CollectionProductsQuery } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { getNavLinks } from "@/lib/nav";
import { storefront } from "@/lib/storefront";

export const metadata: Metadata = { title: "Formulate" };

/** How many products the featured row shows before "View all". */
const FEATURED_COUNT = 4;

/**
 * The home page (SHO-61): a short introduction, the collections to shop by,
 * and the featured collection's first few products.
 *
 * Everything below the introduction comes from the Shopify menu "Shop" (the
 * header's): its collections become the category cards, in menu order, and
 * its **first** collection is the featured one. Reordering that menu changes
 * this page, with no deploy.
 */
const HomePage = async () => {
  const [navLinks, cardsResult] = await Promise.all([
    getNavLinks(),
    storefront.request(CollectionCardsQuery, {}),
  ]);

  if (!cardsResult.ok) return <StorefrontErrorState error={cardsResult.error} />;

  const menuCollections = navLinks.filter((link) => link.kind === "collection");
  const byHandle = new Map(cardsResult.data.collections.nodes.map((c) => [c.handle, c]));
  const categories = menuCollections.flatMap((link) => {
    const collection = byHandle.get(link.handle);
    return collection ? [{ link, collection }] : [];
  });

  const featuredLink = menuCollections[0];
  const featuredResult = featuredLink
    ? await storefront.request(CollectionProductsQuery, {
        handle: featuredLink.handle,
        first: FEATURED_COUNT,
      })
    : null;
  const featured = featuredResult?.ok ? featuredResult.data.collection : null;

  return (
    <>
      <section
        aria-labelledby="home-intro"
        className="rounded-xl bg-surface-muted px-6 py-12 sm:px-10"
      >
        <h1 id="home-intro" className="max-w-xl text-4xl font-semibold tracking-tight">
          Everyday supplements, delivered on your schedule
        </h1>
        <p className="mt-4 max-w-xl text-lg text-foreground">
          Buy once or subscribe. Subscriptions can be skipped, paused or cancelled at any
          time.
        </p>
        {featuredLink ? (
          <Link
            href={featuredLink.path}
            className="mt-8 inline-block rounded-md bg-brand-600 px-6 py-3 font-semibold text-surface hover:bg-brand-700"
          >
            Shop {featuredLink.title}
          </Link>
        ) : null}
      </section>

      {categories.length > 0 ? (
        <section aria-labelledby="home-categories" className="mt-16">
          <h2 id="home-categories" className="text-2xl font-semibold tracking-tight">
            Shop by category
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {categories.map(({ link, collection }) => {
              // Collections here have no image of their own, so the card
              // borrows its first product's.
              const image =
                collection.image ?? collection.products.nodes[0]?.featuredImage;
              return (
                <li key={link.id}>
                  <Link
                    href={link.path}
                    className="group block overflow-hidden rounded-lg border border-border transition-colors hover:border-brand-400"
                  >
                    <div className="aspect-[4/3] bg-surface-muted">
                      {image ? (
                        <Image
                          data={image}
                          sizes="(min-width: 1024px) 320px, 45vw"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium group-hover:text-brand-700">
                        {link.title}
                      </h3>
                      {collection.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-foreground-muted">
                          {collection.description}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {featuredLink && featured && featured.products.nodes.length > 0 ? (
        <section aria-labelledby="home-featured" className="mt-16">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="home-featured" className="text-2xl font-semibold tracking-tight">
              {featured.title}
            </h2>
            <Link
              href={featuredLink.path}
              className="text-sm text-brand-600 underline underline-offset-4"
            >
              View all<span className="sr-only"> {featured.title}</span>
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {featured.products.nodes.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  headingLevel="h3"
                  sizes="(min-width: 1024px) 240px, 45vw"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
};

export { HomePage as default };
