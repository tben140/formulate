"use client";

import { EVENTS, addedToCart } from "@formulate/analytics";
import {
  defaultSelectedOptions,
  findVariantByOptions,
  formatMoney,
  purchasableAllocations,
  withOption,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useActionState, useEffect, useState } from "react";

import { addToCart, type CartActionState } from "@/app/actions/cart";
import { track } from "@/lib/klaviyo";

import { useCartUi } from "./cart-provider";

type Product = NonNullable<ProductByHandleResult["product"]>;

/** Sentinel for "buy it once". Not a selling plan id, so the action skips it. */
const ONE_TIME = "";

/**
 * Lives here rather than beside the action, because a `"use server"` module may
 * only export async functions — exporting this object from there compiles and
 * builds cleanly, then throws on the first request.
 */
const IDLE: CartActionState = { status: "idle" };

/**
 * Variant pickers, subscribe-and-save, and add to cart.
 *
 * The selection rules live in `packages/shopify` and are shared with mobile;
 * only the rendering is here. See docs/adr/0005-parity-means-design-not-data.md.
 */
export const AddToCartForm = ({ product }: { product: Product }) => {
  const { openCart, storeDomain } = useCartUi();
  const [state, formAction, pending] = useActionState(addToCart, IDLE);

  const [selected, setSelected] = useState<readonly SelectedOption[]>(() =>
    defaultSelectedOptions(product.variants.nodes),
  );

  const variant = findVariantByOptions(product.variants.nodes, selected);

  /*
   * Only plans whose group is owned by an installed app.
   *
   * ⚠️ Skipping this filter is not cosmetic. This store's ski wax offers five
   * selling plan groups and four of them are Shopify seed data that no app
   * manages — they add to the cart and complete at checkout, then never charge
   * or ship again. See `hasOwningApp` in packages/shopify.
   */
  const allocations = variant
    ? purchasableAllocations(
        product.sellingPlanGroups.nodes,
        variant.sellingPlanAllocations.nodes,
      )
    : [];

  const [planId, setPlanId] = useState<string>(ONE_TIME);

  /*
   * A plan offered on one variant may not exist on another, so the shopper's
   * choice has to fall back to one-time when they move somewhere it is not
   * available — otherwise add-to-cart sends a plan id the variant has no
   * allocation for and Shopify rejects it.
   *
   * Derived during render rather than reset in an effect. An effect would cause
   * a second render pass, and — more usefully — it would *destroy* the choice:
   * this way `planId` survives, so switching to a variant without the plan and
   * back again restores what they picked.
   */
  const effectivePlanId = allocations.some((a) => a.sellingPlan.id === planId)
    ? planId
    : ONE_TIME;

  /*
   * Opens on the token rather than on status, so adding the same product twice
   * reopens a drawer the shopper closed in between.
   *
   * `Added to Cart` fires here rather than inside the Server Action, because
   * Klaviyo onsite is a browser API and the action runs on the server. The
   * action hands back the updated cart precisely so this can build the payload
   * without a second request.
   */
  useEffect(() => {
    if (state.status !== "success") return;
    openCart();

    const line = state.cart?.lines.nodes.find((l) => l.id === state.addedLineId);
    if (state.cart && line) {
      track(EVENTS.addedToCart, addedToCart(state.cart, line, storeDomain));
    }
  }, [state.token, state.status, state.cart, state.addedLineId, openCart, storeDomain]);

  const chosenAllocation = allocations.find((a) => a.sellingPlan.id === effectivePlanId);
  const displayPrice =
    chosenAllocation?.priceAdjustments[0]?.price ?? variant?.price ?? null;

  const soldOut = Boolean(variant && !variant.availableForSale);

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="merchandiseId" value={variant?.id ?? ""} />
      <input type="hidden" name="sellingPlanId" value={effectivePlanId} />

      {product.options.map((option) =>
        // A single option called "Title" with one value is Shopify's stand-in
        // for "this product has no options". Rendering it produces a pointless
        // one-choice radio group on most products.
        option.optionValues.length <= 1 ? null : (
          <fieldset key={option.name} className="mb-5">
            <legend className="mb-2 text-sm font-semibold">{option.name}</legend>
            <div className="flex flex-wrap gap-2">
              {option.optionValues.map((value) => {
                const candidate = withOption(selected, option.name, value.name);
                const match = findVariantByOptions(product.variants.nodes, candidate);
                const checked = selected.some(
                  (o) => o.name === option.name && o.value === value.name,
                );

                return (
                  <label
                    key={value.name}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                      checked
                        ? "border-brand-600 bg-brand-50 font-medium"
                        : "border-border hover:border-foreground-muted"
                    } ${match && !match.availableForSale ? "text-foreground-muted line-through" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`option-${option.name}`}
                      value={value.name}
                      checked={checked}
                      onChange={() => setSelected(candidate)}
                      className="sr-only"
                    />
                    {value.name}
                    {/*
                      Sold-out combinations stay selectable. A shopper who wants
                      one needs to be able to select it and be told it is gone —
                      hiding it just makes the product look like it never
                      existed.
                    */}
                    {match && !match.availableForSale ? (
                      <span className="sr-only"> (sold out)</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ),
      )}

      {allocations.length > 0 ? (
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold">Purchase options</legend>
          <div className="space-y-2">
            {[
              { id: ONE_TIME, label: "One-time purchase", price: variant?.price },
              ...allocations.map((allocation) => ({
                id: allocation.sellingPlan.id,
                label: allocation.sellingPlan.name,
                price: allocation.priceAdjustments[0]?.price,
              })),
            ].map((choice) => (
              <label
                key={choice.id || "one-time"}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                  effectivePlanId === choice.id
                    ? "border-brand-600 bg-brand-50"
                    : "border-border hover:border-foreground-muted"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="purchase-option"
                    value={choice.id}
                    checked={effectivePlanId === choice.id}
                    onChange={() => setPlanId(choice.id)}
                  />
                  {choice.label}
                </span>
                {choice.price ? (
                  <span className="text-foreground-muted">
                    {/*
                      The leading space is for the accessible name, not the
                      layout — flex handles the visual gap. Without it the
                      label computes as "One-time purchase£24.95", which is
                      what a screen reader would announce.
                    */}
                    {` ${formatMoney(choice.price)}`}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {displayPrice ? (
        <p className="mb-4 text-2xl font-semibold">{formatMoney(displayPrice)}</p>
      ) : null}

      <button
        type="submit"
        disabled={!variant || soldOut || pending}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-surface hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300"
      >
        {pending
          ? "Adding…"
          : soldOut
            ? "Sold out"
            : !variant
              ? "Unavailable in this combination"
              : "Add to cart"}
      </button>

      {/*
        The drawer opening is a visual event a screen reader does not narrate,
        and errors here are the only ones a shopper can act on — so both are
        announced. `polite` rather than `assertive`: nothing here is urgent
        enough to interrupt.
      */}
      <p role="status" aria-live="polite" className="mt-3 text-sm">
        {state.status === "error" ? (
          <span className="text-danger">{state.message}</span>
        ) : state.status === "success" ? (
          <span className="text-success">Added to your cart.</span>
        ) : null}
      </p>
    </form>
  );
};
