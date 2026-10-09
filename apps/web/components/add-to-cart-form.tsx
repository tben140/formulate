"use client";

import {
  EVENTS,
  PRODUCT_EVENTS,
  addedToCart,
  addedToCartProperties,
  numericId,
  productRef,
} from "@formulate/analytics";
import {
  defaultSelectedOptions,
  findVariantByOptions,
  formatMoney,
  purchasableAllocations,
  withOption,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { addToCart, type CartActionState } from "@/app/actions/cart";
import { track } from "@/lib/klaviyo";
import { analytics } from "@/lib/product-analytics";

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
      const added = addedToCartProperties(line);
      if (added) analytics()?.capture(PRODUCT_EVENTS.addedToCart, added);
    }
  }, [state.token, state.status, state.cart, state.addedLineId, openCart, storeDomain]);

  const chosenAllocation = allocations.find((a) => a.sellingPlan.id === effectivePlanId);
  const displayPrice =
    chosenAllocation?.priceAdjustments[0]?.price ?? variant?.price ?? null;

  const soldOut = Boolean(variant && !variant.availableForSale);

  const buttonLabel = pending
    ? "Adding…"
    : soldOut
      ? "Sold out"
      : !variant
        ? "Unavailable in this combination"
        : "Add to cart";

  // Nothing to add: no variant for this combination, or it's sold out.
  const unavailable = !variant || soldOut;

  const primaryButton = useRef<HTMLButtonElement>(null);
  const stickyVisible = useOffScreen(primaryButton);

  return (
    <form
      action={formAction}
      // The buttons are never natively `disabled` (see below), so the form
      // refuses here instead: a second submit while one is in flight would add
      // the item twice, and there's nothing to add when it's unavailable.
      // React skips the action when onSubmit prevents default.
      onSubmit={(event) => {
        if (pending || unavailable) event.preventDefault();
      }}
      className="mt-6"
    >
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
                  // The radio is sr-only, so the global :focus-visible outline
                  // would draw on a clipped 1px box. The label shows it instead,
                  // matching the theme's .product-form__pill (WCAG 2.4.7).
                  <label
                    key={value.name}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${
                      checked
                        ? "border-brand-600 bg-brand-50 font-medium"
                        : "border-border hover:border-foreground-muted"
                    } ${
                      // Muted grey on the selected card's brand-50 is 4.34:1,
                      // under AA's 4.5:1, so a selected sold-out value keeps
                      // full-strength text and relies on the line-through.
                      match && !match.availableForSale
                        ? `line-through ${checked ? "" : "text-foreground-muted"}`
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`option-${option.name}`}
                      value={value.name}
                      checked={checked}
                      onChange={() => {
                        setSelected(candidate);
                        if (match) {
                          analytics()?.capture(PRODUCT_EVENTS.variantSelected, {
                            ...productRef(product),
                            variant_id: numericId(match.id),
                            variant_title: match.title,
                          });
                        }
                      }}
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
                    onChange={() => {
                      setPlanId(choice.id);
                      analytics()?.capture(PRODUCT_EVENTS.sellingPlanSelected, {
                        ...productRef(product),
                        selling_plan: choice.id === ONE_TIME ? null : choice.label,
                      });
                    }}
                  />
                  {choice.label}
                </span>
                {choice.price ? (
                  <span
                    // Full-strength on the selected card: muted grey on
                    // brand-50 is 4.34:1, under AA's 4.5:1.
                    className={`font-mono ${
                      effectivePlanId === choice.id
                        ? "text-foreground"
                        : "text-foreground-muted"
                    }`}
                  >
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
        // DM Mono ships in 400 and 500 only; semibold would be synthesised.
        <p className="mb-4 font-mono text-2xl font-medium">{formatMoney(displayPrice)}</p>
      ) : null}

      {/*
        ⚠️ `aria-disabled`, never `disabled` (SHO-134). A focused button that
        becomes disabled drops focus to <body>, so the cart drawer, which
        returns focus to whatever had it when it opened, would send a keyboard
        user back to the top of the page on close. That happens while an add is
        in flight, and also after one: adding the last unit in stock
        revalidates the page, the variant comes back sold out, and the button
        that has focus would turn disabled in the same render.
      */}
      <button
        ref={primaryButton}
        type="submit"
        aria-disabled={pending || unavailable || undefined}
        data-unavailable={unavailable || undefined}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-surface hover:bg-brand-700 aria-disabled:cursor-wait data-unavailable:cursor-not-allowed data-unavailable:bg-ink-300 data-unavailable:hover:bg-ink-300"
      >
        {buttonLabel}
      </button>

      {/*
        The drawer opening is a visual event a screen reader does not narrate,
        and errors here are the only ones a shopper can act on — so both are
        announced. `polite` rather than `assertive`: nothing here is urgent
        enough to interrupt.
      */}
      {/*
        Inside the same form and fed by the same render, so it cannot disagree
        with the controls above: one state, two views of it (SHO-117). Its
        button submits this form, with the same variant and plan.
      */}
      <StickyAddToCart
        visible={stickyVisible}
        title={product.title}
        variantTitle={variant && variant.title !== "Default Title" ? variant.title : null}
        planName={chosenAllocation?.sellingPlan.name ?? null}
        price={displayPrice ? formatMoney(displayPrice) : null}
        buttonLabel={buttonLabel}
        unavailable={unavailable}
        busy={pending}
        error={state.status === "error" ? (state.message ?? null) : null}
        returnFocusTo={primaryButton}
      />

      <p role="status" aria-live="polite" className="mt-3 text-sm">
        {state.status === "error" ? (
          <span className="text-danger">{state.message}</span>
        ) : state.status === "success" ? (
          // A message on success means fewer were added than asked for, which
          // the shopper needs to notice — so it is not styled as a success.
          state.message ? (
            <span className="text-foreground">{state.message}</span>
          ) : (
            <span className="text-success">Added to your cart.</span>
          )
        ) : null}
      </p>
    </form>
  );
};

/**
 * True while `target` is not on screen, above or below.
 *
 * An IntersectionObserver rather than a scroll-position threshold: a threshold
 * is a number that silently goes wrong when anything above the button changes
 * height.
 *
 * Either direction, not only "scrolled past". On a phone this PDP is image
 * first and the button sits near the end: measured on Whey Protein at 390px,
 * the button starts 993px down a 1,308px page and is still on screen at the
 * bottom of the scroll. A bar that waited for the button to leave upwards
 * would never appear. What it is for here is the opposite case: a shopper
 * looking at the product above the button.
 */
const useOffScreen = (target: React.RefObject<HTMLElement | null>): boolean => {
  const [offScreen, setOffScreen] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOffScreen(!entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return offScreen;
};

/** Tailwind's `md`. The bar is a small-viewport affordance only. */
const SMALL_VIEWPORT = "(max-width: 767px)";

/**
 * Whether a media query matches, kept current: rotating a phone or tablet can
 * cross `md`, and the bar's page padding has to follow.
 */
const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    // On the server there is no viewport: no bar, so no padding.
    () => false,
  );

const StickyAddToCart = ({
  visible,
  title,
  variantTitle,
  planName,
  price,
  buttonLabel,
  unavailable,
  busy,
  error,
  returnFocusTo,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly variantTitle: string | null;
  readonly planName: string | null;
  readonly price: string | null;
  readonly buttonLabel: string;
  /** Nothing to add. aria-disabled, never disabled: see the main button. */
  readonly unavailable: boolean;
  /** An add is in flight. aria-disabled too. */
  readonly busy: boolean;
  /** A failed add's message, shown in the bar too: the form's own is off screen. */
  readonly error: string | null;
  /** Where focus goes if the bar hides while it holds focus. */
  readonly returnFocusTo: React.RefObject<HTMLElement | null>;
}) => {
  const bar = useRef<HTMLDivElement>(null);
  const small = useMediaQuery(SMALL_VIEWPORT);

  /*
   * Pads the page by the bar's height while it shows, so it never sits on top
   * of the last line of content (the footer's sign-up). Only on small
   * viewports, where the bar exists at all. Follows the viewport crossing `md`
   * (rotation) and the bar's own height (an error line), not just `visible`.
   */
  useEffect(() => {
    const element = bar.current;
    if (!visible || !small || !element) return;

    const previous = document.body.style.paddingBottom;
    const pad = () => {
      document.body.style.paddingBottom = `${element.offsetHeight}px`;
    };
    pad();
    const observer = new ResizeObserver(pad);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = previous;
    };
  }, [visible, small]);

  /*
   * The bar goes inert as it hides. If its button had focus (a keyboard or
   * screen reader user who just used it), focus would fall back to <body>, the
   * top of the page. The main button is on screen by then, by definition, so
   * focus moves there instead.
   */
  useEffect(() => {
    if (visible) return;
    if (bar.current?.contains(document.activeElement)) {
      returnFocusTo.current?.focus({ preventScroll: true });
    }
  }, [visible, returnFocusTo]);

  const detail = [variantTitle, planName].filter(Boolean).join(" · ");

  return (
    <div
      ref={bar}
      // Out of the tab order and the accessibility tree while hidden. Two live
      // "Add to cart" buttons, one of them invisible, would be worse than one.
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-4 py-3 transition-transform duration-200 motion-reduce:transition-none md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/*
        Not a live region: the form's status line already announces the error,
        and two would read it twice. This is for sighted shoppers, who can't
        see that line while the bar is up.
      */}
      {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-foreground-muted">
            {[detail, price].filter(Boolean).join(" — ")}
          </p>
        </div>
        <button
          type="submit"
          aria-disabled={busy || unavailable || undefined}
          data-unavailable={unavailable || undefined}
          // Starts with the visible text, so voice control users can say what
          // they see (WCAG 2.5.3), and adds the product so a screen reader's
          // list of buttons can tell this one from the main button.
          aria-label={`${buttonLabel}, ${title}${variantTitle ? `, ${variantTitle}` : ""}`}
          className="shrink-0 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700 aria-disabled:cursor-wait data-unavailable:cursor-not-allowed data-unavailable:bg-ink-300 data-unavailable:hover:bg-ink-300"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};
