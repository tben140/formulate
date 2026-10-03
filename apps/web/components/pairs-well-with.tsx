import { ComplementaryProductsQuery, formatMoney } from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import Link from "next/link";

import { storefront } from "@/lib/storefront";

/** How many pairings to show at most. Two are set per product today. */
const LIMIT = 3;

/**
 * "Pairs well with", from the complementary products set per product in
 * Shopify's Search & Discovery app (SHO-153).
 *
 * A merchandising pairing only. The copy must never suggest a health benefit
 * of taking the products together.
 *
 * Renders nothing when there are none, or when the request fails: this is a
 * suggestion beside the product, never a reason for the page to error.
 * Shopify leaves unavailable products out, so a sold-out pairing simply
 * disappears.
 *
 * An async Server Component: the product page wraps it in <Suspense>, so its
 * request streams in after the product and never holds up the page.
 */
export const PairsWellWith = async ({ productId }: { readonly productId: string }) => {
  const result = await storefront.request(ComplementaryProductsQuery, { productId });
  const products = result.ok
    ? (result.data.productRecommendations?.slice(0, LIMIT) ?? [])
    : [];
  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="pairs-well-with"
      className="mt-10 border-t border-border pt-6"
    >
      <h2 id="pairs-well-with" className="text-base font-semibold">
        Pairs well with
      </h2>
      <ul className="mt-4 space-y-3">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.handle}`}
              className="group flex items-center gap-3 rounded-lg border border-border p-2 transition-colors hover:border-brand-400"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                {product.featuredImage ? (
                  <Image
                    data={product.featuredImage}
                    width={64}
                    height={64}
                    sizes="64px"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium group-hover:text-brand-700">
                  {product.title}
                </p>
                <p className="font-mono text-sm text-foreground-muted">
                  {formatMoney(product.priceRange.minVariantPrice)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};
