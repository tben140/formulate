import { formatMoney, type MoneyLike } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";

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
          // ink-600, not foreground-muted: ink-500 on this panel is 4.34:1,
          // under AA (found by the Storybook a11y tests).
          <div
            className="flex h-full items-center justify-center text-sm text-ink-600"
            aria-hidden="true"
          >
            No image
          </div>
        )}
      </div>

      <Heading className="text-base font-medium group-hover:text-brand-700">
        {product.title}
      </Heading>
      <p className="mt-1 font-mono text-sm text-foreground-muted">
        {formatMoney(product.priceRange.minVariantPrice)}
      </p>
    </Link>
  );
};
