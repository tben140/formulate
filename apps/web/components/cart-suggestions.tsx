"use client";

import { EVENTS, addedToCart } from "@formulate/analytics";
import { formatMoney, type CartSuggestion } from "@formulate/shopify";
import Link from "next/link";
import { useActionState, useId } from "react";

import { addToCart, type CartActionState } from "@/app/actions/cart";
import { track } from "@/lib/klaviyo";

import { CART_DRAWER_TITLE_ID, useCartUi } from "./cart-provider";

const IDLE: CartActionState = { status: "idle" };

/**
 * "You might also like", inside the cart drawer (SHO-116).
 *
 * Renders nothing at all when there is nothing to suggest: no heading over an
 * empty gap. Which products appear is decided by `selectCartSuggestions` in
 * packages/shopify, the same rule mobile uses and the theme restates in Liquid.
 */
export const CartSuggestions = ({
  suggestions,
}: {
  suggestions: readonly CartSuggestion[];
}) => {
  const headingId = useId();
  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="border-t border-border px-4 py-4">
      <h3 id={headingId} className="mb-3 text-sm font-semibold">
        You might also like
      </h3>
      <ul className="space-y-3">
        {suggestions.map((suggestion) => (
          <Suggestion key={suggestion.product.id} suggestion={suggestion} />
        ))}
      </ul>
    </section>
  );
};

const Suggestion = ({ suggestion }: { suggestion: CartSuggestion }) => {
  const { product } = suggestion;
  const { closeCart, storeDomain } = useCartUi();
  /*
   * The add, wrapped so the follow-up runs when the server answers, not in an
   * effect. A successful add revalidates the layout, which drops this product
   * from the suggestions in the same render, so this component unmounts before
   * an effect could run: the Klaviyo event never fired (review of #38), and
   * the focused button vanished, leaving focus nowhere inside the modal.
   */
  const [state, formAction, pending] = useActionState(
    async (previous: CartActionState, data: FormData) => {
      const next = await addToCart(previous, data);
      if (next.status === "success") {
        // The same Klaviyo event as the product page's add, so a drawer add
        // counts as an add.
        const line = next.cart?.lines.nodes.find((l) => l.id === next.addedLineId);
        if (next.cart && line)
          track(EVENTS.addedToCart, addedToCart(next.cart, line, storeDomain));
        // The drawer's heading survives the re-render and announces the new
        // count, which is also the confirmation a screen reader needs.
        document.getElementById(CART_DRAWER_TITLE_ID)?.focus();
      }
      return next;
    },
    IDLE,
  );

  return (
    <li className="flex items-center gap-3">
      {product.featuredImage ? (
        // Plain <img>, as for the cart lines above: fixed small Shopify CDN
        // images inside a dialog.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.featuredImage.url}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{product.title}</p>
        <p className="text-xs text-foreground-muted">
          {formatMoney(product.priceRange.minVariantPrice)}
        </p>
        {state.status === "error" ? (
          <p role="alert" className="text-xs text-danger">
            {state.message}
          </p>
        ) : null}
      </div>

      {suggestion.kind === "add" ? (
        <form
          action={formAction}
          onSubmit={(event) => {
            // Same guard as the product page: no double add while one runs,
            // and the button stays focusable (SHO-134).
            if (pending) event.preventDefault();
          }}
        >
          <input type="hidden" name="merchandiseId" value={suggestion.variantId} />
          <button
            type="submit"
            aria-disabled={pending || undefined}
            className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 aria-disabled:cursor-wait"
          >
            {pending ? "Adding…" : "Add"}
            <span className="sr-only"> {product.title} to cart</span>
          </button>
        </form>
      ) : (
        <Link
          href={`/products/${product.handle}`}
          onClick={closeCart}
          className="text-xs font-semibold text-brand-600 underline underline-offset-2"
        >
          Choose options
          <span className="sr-only"> for {product.title}</span>
        </Link>
      )}
    </li>
  );
};
