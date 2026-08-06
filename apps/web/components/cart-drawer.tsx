"use client";

import { formatMoney, type Cart } from "@formulate/shopify";
import { useEffect, useRef } from "react";

import { removeCartLine, updateCartLine } from "@/app/actions/cart";

import { useCartUi } from "./cart-provider";

/**
 * The slide-in cart.
 *
 * Built on the native `<dialog>` element, which is doing a lot of unglamorous
 * work for free and correctly:
 *
 *   - focus is trapped inside while open, and returned to the trigger on close
 *   - Escape closes it
 *   - the rest of the page becomes inert, so a screen reader cannot wander into
 *     content the sighted user cannot see
 *   - `::backdrop` is a real pseudo-element, not a div pretending to be one
 *
 * Hand-rolling any of that is where accessible drawers usually go wrong. The
 * only thing added on top is the slide, which is pure CSS in globals.css.
 */
export const CartDrawer = ({ cart }: { cart: Cart | null }) => {
  const { open, closeCart } = useCartUi();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // showModal() throws if already open, close() on a closed dialog is a no-op
    // that still fires nothing — so both are guarded rather than called blindly.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const lines = cart?.lines.nodes ?? [];

  return (
    <dialog
      ref={ref}
      aria-label="Shopping cart"
      className="cart-drawer"
      // Escape and any native close route through here, so context state can
      // never drift out of step with the element's real open/closed state.
      onClose={closeCart}
      // The dialog element fills the viewport; its visible panel is the inner
      // div. A click landing on the element itself is therefore a click on the
      // backdrop.
      onClick={(event) => {
        if (event.target === ref.current) closeCart();
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="text-lg font-semibold">
            Cart
            {cart?.totalQuantity ? (
              <span className="ml-2 text-sm font-normal text-foreground-muted">
                {cart.totalQuantity} {cart.totalQuantity === 1 ? "item" : "items"}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            className="rounded-md px-2 py-1 text-sm text-foreground-muted hover:text-foreground"
          >
            Close
            <span className="sr-only"> cart</span>
          </button>
        </header>

        {lines.length === 0 ? (
          <p className="flex-1 px-4 py-8 text-sm text-foreground-muted">
            Your cart is empty.
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {lines.map((line) => {
              // `merchandise` is a union in the schema, but ProductVariant is
              // its only member we select, so codegen flattens it — no
              // __typename narrowing needed here.
              const variant = line.merchandise;

              return (
                <li key={line.id} className="flex gap-3 px-4 py-4">
                  {variant.image ? (
                    // Plain <img>: these are Shopify CDN URLs at a fixed small
                    // size inside a dialog, so next/image's optimisation and
                    // layout machinery would cost more than it returns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={variant.image.url}
                      alt=""
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {variant.product.title}
                    </p>
                    {variant.title !== "Default Title" ? (
                      <p className="text-xs text-foreground-muted">{variant.title}</p>
                    ) : null}

                    {/*
                      The subscription line is the whole reason the selling-plan
                      filter exists. Showing it here is how a shopper confirms
                      they bought a subscription rather than a one-off.
                    */}
                    {line.sellingPlanAllocation ? (
                      <p className="mt-0.5 text-xs font-medium text-brand-600">
                        {line.sellingPlanAllocation.sellingPlan.name}
                      </p>
                    ) : null}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <form action={updateCartLine} className="flex items-center gap-1">
                        <input type="hidden" name="lineId" value={line.id} />
                        <label htmlFor={`qty-${line.id}`} className="sr-only">
                          Quantity for {variant.product.title}
                        </label>
                        <input
                          id={`qty-${line.id}`}
                          name="quantity"
                          type="number"
                          min={0}
                          defaultValue={line.quantity}
                          className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-md px-2 py-1 text-xs text-brand-600 underline underline-offset-2"
                        >
                          Update
                        </button>
                      </form>

                      <p className="text-sm">{formatMoney(line.cost.totalAmount)}</p>
                    </div>
                  </div>

                  <form action={removeCartLine}>
                    <input type="hidden" name="lineId" value={line.id} />
                    <button
                      type="submit"
                      className="text-xs text-foreground-muted underline underline-offset-2 hover:text-danger"
                    >
                      Remove
                      <span className="sr-only"> {variant.product.title} from cart</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {cart && lines.length > 0 ? (
          <footer className="border-t border-border px-4 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-foreground-muted">Subtotal</span>
              <span className="font-medium">{formatMoney(cart.cost.subtotalAmount)}</span>
            </div>

            <p className="mb-3 text-xs text-foreground-muted">
              Taxes and shipping calculated at checkout.
            </p>

            {/*
              A link, not a button with an onClick. Checkout is a cross-origin
              navigation to Shopify — there is nothing to intercept, and a real
              anchor keeps middle-click, right-click and keyboard behaviour that
              a scripted redirect would break.
            */}
            <a
              href={cart.checkoutUrl}
              className="block rounded-md bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-surface hover:bg-brand-700"
            >
              Checkout
            </a>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
};
