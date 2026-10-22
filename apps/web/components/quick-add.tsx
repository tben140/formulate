"use client";

import { EVENTS, addedToCart } from "@formulate/analytics";
import { useActionState, useEffect } from "react";

import { addToCart, type CartActionState } from "@/app/actions/cart";
import { track } from "@/lib/klaviyo";

import { useCartUi } from "./cart-provider";

const IDLE: CartActionState = { status: "idle" };

/**
 * Add a single-variant product from a grid, as a one-time purchase
 * (cardOffer in packages/shopify). Opens the cart, as the product page does,
 * where the line can still be switched to Subscribe & save.
 */
export const QuickAdd = ({
  variantId,
  productTitle,
}: {
  readonly variantId: string;
  readonly productTitle: string;
}) => {
  const { openCart, storeDomain } = useCartUi();
  const [state, formAction, pending] = useActionState(addToCart, IDLE);

  // On the token, so a second add reopens a drawer closed in between.
  useEffect(() => {
    if (state.status !== "success") return;
    openCart();
    const line = state.cart?.lines.nodes.find((l) => l.id === state.addedLineId);
    if (state.cart && line)
      track(EVENTS.addedToCart, addedToCart(state.cart, line, storeDomain));
  }, [state.token, state.status, state.cart, state.addedLineId, openCart, storeDomain]);

  return (
    <form
      action={formAction}
      // React skips the action when onSubmit prevents default.
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="mt-3"
    >
      <input type="hidden" name="merchandiseId" value={variantId} />
      <input type="hidden" name="quantity" value="1" />
      {/* aria-disabled, not disabled: focus stays on the button (SHO-134). */}
      <button
        type="submit"
        aria-disabled={pending || undefined}
        aria-label={`Add ${productTitle} to cart`}
        className="min-h-11 w-full rounded-md border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 aria-disabled:cursor-wait"
      >
        {pending ? "Adding…" : "Add to cart"}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {state.status === "error"
          ? state.message
          : state.status === "success"
            ? "Added to your cart."
            : ""}
      </p>
      {state.status === "error" ? (
        <p className="mt-1 text-xs text-danger" aria-hidden="true">
          {state.message}
        </p>
      ) : null}
    </form>
  );
};
