"use client";

import {
  EVENTS,
  PRODUCT_EVENTS,
  addedToCart,
  addedToCartProperties,
} from "@formulate/analytics";
import { useActionState, useEffect } from "react";

import { addToCart, type CartActionState } from "@/app/actions/cart";
import { track } from "@/lib/klaviyo";
import { analytics } from "@/lib/product-analytics";

import { AnalyticsIdField } from "./analytics-id-field";
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
  const { openCart, siteOrigin } = useCartUi();
  const [state, formAction, pending] = useActionState(addToCart, IDLE);

  // On the token, so a second add reopens a drawer closed in between.
  useEffect(() => {
    if (state.status !== "success") return;
    openCart();
    // Klaviyo and PostHog, as the product page's form records an add.
    const line = state.cart?.lines.nodes.find((l) => l.id === state.addedLineId);
    const quantity = state.addedQuantity ?? 1;
    if (state.cart && line && quantity > 0) {
      track(EVENTS.addedToCart, addedToCart(state.cart, line, siteOrigin, quantity));
      const added = addedToCartProperties(line, quantity);
      if (added) analytics()?.capture(PRODUCT_EVENTS.addedToCart, added);
    }
  }, [
    state.token,
    state.status,
    state.cart,
    state.addedLineId,
    state.addedQuantity,
    openCart,
    siteOrigin,
  ]);

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
      {/* As every add form does: without it, an add takes the analytics id off the cart. */}
      <AnalyticsIdField />
      {/* aria-disabled, not disabled: focus stays on the button (SHO-134). */}
      <button
        type="submit"
        aria-disabled={pending || undefined}
        // Visible text first, then the product (WCAG 2.5.3), as the sticky bar does.
        aria-label={`Add to cart, ${productTitle}`}
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
