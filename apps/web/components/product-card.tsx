import {
  formatMoney,
  type MoneyLike,
  ratingLabel,
  reviewSummary,
} from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";

import { Stars } from "./stars";

type CardImage = {
  readonly url: string;
  readonly altText?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
};

export type ProductCardData = {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: CardImage | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Standard review metafields, when the query asked for them. */
  readonly rating?: { readonly value: string } | null;
  readonly ratingCount?: { readonly value: string } | null;
};

/**
 * A product in a grid: image, title and starting price, linking to the product
 * page. `headingLevel` keeps the page outline right wherever the grid sits.
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
  return (
    <Link
      href={`/products/${product.handle}`}
      className="group block rounded-lg border border-border p-3 transition-colors hover:border-brand-400"
    >
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

      <Heading className="text-base font-medium group-hover:text-brand-700">
        {product.title}
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
    </Link>
  );
};
