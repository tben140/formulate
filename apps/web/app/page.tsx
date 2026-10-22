import {
  CollectionCardsQuery,
  CollectionProductsQuery,
  HOME_HEADLINE,
  QUIZ_PROMPT,
  cardOffer,
  homeBenefits,
  homeSubheading,
} from "@formulate/shopify";
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
 * The home page (SHO-61): what we sell and why subscribe, then the featured
 * collection's best few products, the collections to shop by, and the quiz.
 *
 * Its words are shared with the app (packages/shopify/src/home.ts); the
 * saving it promises is read from a featured product's plan, not written here.
 * A page builder for web and the app is planned (see docs); until then this
 * page is code, and the theme's is sections the merchant arranges.
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

  const products = featured?.products.nodes ?? [];
  const savingPercent =
    products.map((product) => cardOffer(product).savingPercent).find(Boolean) ?? null;
  const heroImage = products.find((product) => product.featuredImage)?.featuredImage;

  return (
    <>
      <section
        aria-labelledby="home-intro"
        className="grid items-center gap-8 overflow-hidden rounded-xl bg-surface-muted px-6 py-10 sm:px-10 md:grid-cols-2"
      >
        <div>
          <h1 id="home-intro" className="max-w-xl text-4xl font-semibold tracking-tight">
            {HOME_HEADLINE}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-foreground">
            {homeSubheading(savingPercent)}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {featuredLink ? (
              <Link
                href={featuredLink.path}
                className="inline-block rounded-md bg-brand-600 px-6 py-3 font-semibold text-surface hover:bg-brand-700"
              >
                Shop {featuredLink.title}
              </Link>
            ) : null}
            <Link
              href={QUIZ_PROMPT.path}
              className="inline-block rounded-md border border-brand-600 px-6 py-3 font-semibold text-brand-700 hover:bg-brand-50"
            >
              {QUIZ_PROMPT.cta}
            </Link>
          </div>
        </div>
        {heroImage ? (
          <div className="mx-auto aspect-square w-full max-w-60 overflow-hidden rounded-lg md:max-w-sm">
            {/* The page's Largest Contentful Paint on a desktop: eager. */}
            <Image
              data={heroImage}
              sizes="(min-width: 768px) 384px, 90vw"
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        ) : null}
      </section>

      <ul
        aria-label="Why Double Helix"
        className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
      >
        {homeBenefits(savingPercent).map((benefit) => (
          <li
            key={benefit}
            className="flex items-start gap-2 rounded-lg border border-border px-3 py-3"
          >
            <span aria-hidden="true" className="font-semibold text-brand-600">
              ✓
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      {featuredLink && featured && products.length > 0 ? (
        <section aria-labelledby="home-featured" className="mt-14">
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
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {products.map((product) => (
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

      {categories.length > 0 ? (
        <section aria-labelledby="home-categories" className="mt-14">
          <h2 id="home-categories" className="text-2xl font-semibold tracking-tight">
            Shop by category
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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

      <section
        aria-labelledby="home-quiz"
        className="mt-14 flex flex-col items-start gap-4 rounded-xl border border-border px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10"
      >
        <div>
          <h2 id="home-quiz" className="text-2xl font-semibold tracking-tight">
            {QUIZ_PROMPT.title}
          </h2>
          <p className="mt-2 max-w-xl text-foreground-muted">{QUIZ_PROMPT.body}</p>
        </div>
        <Link
          href={QUIZ_PROMPT.path}
          className="inline-block shrink-0 rounded-md bg-brand-600 px-6 py-3 font-semibold text-surface hover:bg-brand-700"
        >
          {QUIZ_PROMPT.cta}
        </Link>
      </section>
    </>
  );
};

export { HomePage as default };
