import {
  cardOffer,
  type CardOfferLike,
  formatMoney,
  type MoneyLike,
  ratingLabel,
  reviewSummary,
} from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";

import { QuickAdd } from "./quick-add";
import { Stars } from "./stars";

type CardImage = {
  readonly url: string;
  readonly altText?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
};

export type ProductCardData = CardOfferLike & {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: CardImage | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Standard review metafields, when the query asked for them. */
  readonly rating?: { readonly value: string } | null;
  readonly ratingCount?: { readonly value: string } | null;
};

/**
 * A product in a grid: image, title, rating, starting price and subscription
 * saving, linking to the product page, with Add to cart for a product that has
 * nothing to choose (cardOffer). `headingLevel` keeps the page outline right
 * wherever the grid sits.
 *
 * The card is a box with one link (the title, stretched over the card) and,
 * beside it, the quick-add form: a button can't sit inside a link.
 *
 * `loading` and `fetchPriority` pass through to the image, for a grid's first
 * row, which is on screen at load (SHO-143). Hydrogen's Image defaults to lazy.
 */
export const ProductCard = ({
  product,
  sizes,
  headingLevel = "h2",
  loading,
  fetchPriority,
}: {
  readonly product: ProductCardData;
  readonly sizes: string;
  readonly headingLevel?: "h2" | "h3";
  readonly loading?: "eager" | "lazy";
  readonly fetchPriority?: "high" | "auto";
}) => {
  const Heading = headingLevel;
  const summary = reviewSummary(product);
  const offer = cardOffer(product);
  return (
    <div className="group relative flex h-full flex-col rounded-lg border border-border p-3 transition-colors hover:border-brand-400">
      <div className="mb-3 aspect-square overflow-hidden rounded-md bg-surface-muted">
        {product.featuredImage ? (
          <Image
            data={product.featuredImage}
            sizes={sizes}
            className="h-full w-full object-cover"
            loading={loading}
            fetchPriority={fetchPriority}
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

      <Heading className="text-sm font-medium group-hover:text-brand-700 sm:text-base">
        <Link
          href={`/products/${product.handle}`}
          // Stretched over the whole card, so all of it is the link, as before.
          className="after:absolute after:inset-0 after:rounded-lg"
        >
          {product.title}
        </Link>
      </Heading>
      {summary ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-muted">
          <Stars value={summary.average} label={ratingLabel(summary)} size={12} />
          <span aria-hidden="true">({summary.count})</span>
        </p>
      ) : null}
      <p className="mt-1 font-mono text-sm text-foreground-muted">
        {formatMoney(product.priceRange.minVariantPrice)}
      </p>
      {offer.subscribe ? (
        <p className="mt-1 text-xs font-medium text-brand-700">{offer.subscribe}</p>
      ) : null}
      {offer.quickAddVariantId ? (
        // Above the stretched link, and at the bottom of every card in a row.
        <div className="relative z-10 mt-auto">
          <QuickAdd variantId={offer.quickAddVariantId} productTitle={product.title} />
        </div>
      ) : null}
    </div>
  );
};
