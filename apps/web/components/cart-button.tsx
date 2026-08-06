"use client";

import { useCartUi } from "./cart-provider";

/**
 * The header trigger.
 *
 * `totalQuantity` arrives as a prop from the root layout's server-rendered
 * cart, so the count is correct on first paint with no loading state and no
 * flash of an empty badge.
 */
export const CartButton = ({ totalQuantity }: { totalQuantity: number }) => {
  const { openCart } = useCartUi();

  return (
    <button
      type="button"
      onClick={openCart}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      // The visible label is "Cart 2", which a screen reader would read as
      // "Cart two" — ambiguous. This says what the number means.
      aria-label={
        totalQuantity > 0
          ? `Open cart, ${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`
          : "Open cart, empty"
      }
    >
      Cart
      {totalQuantity > 0 ? (
        <span
          aria-hidden="true"
          className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-surface"
        >
          {totalQuantity}
        </span>
      ) : null}
    </button>
  );
};
