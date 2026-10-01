import { Component } from "@theme/component";
import { addItem } from "@theme/cart-api";
import { openCartDrawer, replaceCartDrawer } from "@theme/cart-drawer";

/**
 * @typedef {Object} VariantData
 * @property {number} id
 * @property {boolean} available
 * @property {string[]} options Option values, in the product's option order.
 * @property {string} price Already formatted by Liquid's `money` filter.
 * @property {PlanData[]} [plans] App-owned selling plans only. See the filter
 *   in snippets/product-form.liquid.
 */

/**
 * @typedef {Object} PlanData
 * @property {number} id
 * @property {string} name
 * @property {string} price Already formatted by Liquid's `money` filter.
 */

/**
 * @typedef {Object} ProductFormRefs
 * @property {HTMLInputElement} [variantId]
 * @property {HTMLElement} [price]
 * @property {HTMLButtonElement} [submit]
 * @property {HTMLElement} [status]
 * @property {HTMLInputElement | HTMLInputElement[]} [optionInput]
 * @property {HTMLFieldSetElement} [plans]
 * @property {HTMLElement} [planList]
 * @property {HTMLElement} [stickyBar]
 * @property {HTMLElement} [stickyDetail]
 * @property {HTMLButtonElement} [stickySubmit]
 * @property {HTMLElement} [stickyError]
 */

/**
 * Add to cart, progressively enhanced.
 *
 * The form works without this component — it is a real POST to /cart/add that
 * Shopify handles and redirects. Everything here is the improvement: resolving
 * option pills to a variant, and swapping the page reload for a drawer.
 *
 * @extends {Component<ProductFormRefs>}
 */
class ProductForm extends Component {
  /** @type {VariantData[]} */
  #variants = [];

  /**
   * The plan the shopper chose, kept across variant changes.
   *
   * Mirrors `planId` versus `effectivePlanId` in apps/web's add-to-cart-form:
   * moving to a variant that doesn't offer this plan falls back to one-time
   * *without forgetting the choice*, so moving back restores it. "" is one-time.
   */
  #planId = "";

  /** The variant the plan list was last built for, so it is rebuilt only on a
   * real change. Rebuilding on a plan click would destroy the radio the shopper
   * just focused. */
  /** @type {number | null} */
  #plansBuiltFor = null;

  /** @override */
  connectedCallback() {
    super.connectedCallback();

    const json = this.parentElement?.querySelector("[data-product-variants]");
    if (json?.textContent) {
      this.#variants = JSON.parse(json.textContent);
    }

    // Listeners are bound with the component's own signal, so they are removed
    // when the element leaves the DOM without disconnectedCallback tracking
    // anything by hand. See assets/component.js.
    this.addEventListener("change", this.#onChange, { signal: this.signal });
    this.addEventListener("submit", this.#onSubmit, { signal: this.signal });

    const checkedPlan = this.querySelector('input[name="selling_plan"]:checked');
    this.#planId = checkedPlan instanceof HTMLInputElement ? checkedPlan.value : "";

    // When Liquid rendered plans for the initial variant they are already
    // right and are left alone. An empty list (this variant has none) is built
    // here, so the one-time radio exists for when the shopper moves to one that
    // does.
    const rendered = this.refs.planList?.querySelector('input[name="selling_plan"]');
    this.#plansBuiltFor = rendered ? Number(this.refs.variantId?.value) || null : null;
    this.#sync();
    this.#observeMainButton();
  }

  /**
   * Shows the sticky bar while the main button is off screen, above or below.
   *
   * An IntersectionObserver rather than a scroll threshold, which silently goes
   * wrong when content above the button changes height. Either direction,
   * because on a phone this page is image first with the button near the end;
   * see `useOffScreen` in apps/web's add-to-cart-form, where this was measured.
   */
  #observeMainButton() {
    const { submit, stickyBar } = this.refs;
    if (!submit || !stickyBar) return;

    const small = window.matchMedia("(max-width: 47.99rem)");
    let shown = false;

    // Pad the page so the bar never covers the last of it, only where the bar
    // exists at all (CSS hides it from 48rem up). Re-run when the viewport
    // crosses 48rem (rotating a phone) and when the bar's height changes (an
    // error line), not only when it shows or hides.
    const pad = () => {
      document.body.style.paddingBottom =
        shown && small.matches ? `${stickyBar.offsetHeight}px` : "";
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      shown = !entry.isIntersecting;
      // Going inert drops focus to <body>, the top of the page, if the bar's
      // button had it. The main button is on screen by now, so hand it over.
      if (!shown && stickyBar.contains(document.activeElement)) {
        submit.focus({ preventScroll: true });
      }
      stickyBar.classList.toggle("is-visible", shown);
      stickyBar.inert = !shown;
      pad();
    });
    observer.observe(submit);

    const resize = new ResizeObserver(pad);
    resize.observe(stickyBar);
    small.addEventListener("change", pad, { signal: this.signal });

    this.signal.addEventListener("abort", () => {
      observer.disconnect();
      resize.disconnect();
      document.body.style.paddingBottom = "";
    });
  }

  /** The option pills, as a flat array regardless of how many there are. */
  get #optionInputs() {
    const refs = this.refs.optionInput;
    if (!refs) return [];
    return Array.isArray(refs) ? refs : [refs];
  }

  /** The checked option values, in the product's option order. */
  get #chosen() {
    return this.#optionInputs
      .filter((input) => input.checked)
      .sort((a, b) => Number(a.dataset.optionPosition) - Number(b.dataset.optionPosition))
      .map((input) => input.value);
  }

  /**
   * Mirrors `findVariantByOptions` in packages/shopify: an exact match on every
   * axis, and no match rather than a guess. A combination that does not exist
   * disables the button instead of silently adding something else.
   *
   * @param {string[]} chosen
   * @returns {VariantData | undefined}
   */
  #find(chosen) {
    return this.#variants.find(
      (variant) =>
        variant.options.length === chosen.length &&
        variant.options.every((value, index) => value === chosen[index]),
    );
  }

  /** @param {Event} event */
  #onChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.name === "selling_plan") this.#planId = event.target.value;
    this.#sync();
  };

  /** Brings every dependent part of the form into step with the selection. */
  #sync() {
    const chosen = this.#chosen;
    // A product with only Shopify's default variant renders no pills, so there
    // is nothing to resolve: its one variant is the match.
    const match = this.#optionInputs.length ? this.#find(chosen) : this.#variants[0];
    const plans = match?.plans ?? [];
    const effectivePlan = plans.find((plan) => String(plan.id) === this.#planId);

    const { variantId, price, submit } = this.refs;

    if (variantId) variantId.value = match ? String(match.id) : "";

    // The headline price follows the purchase option, as on web and mobile
    // (SHO-124). The per-option prices in the list were always right.
    if (price && match) price.textContent = effectivePlan?.price ?? match.price;

    const label = !match
      ? (submit?.dataset.unavailableLabel ?? "Unavailable")
      : match.available
        ? (submit?.dataset.addLabel ?? "Add to cart")
        : (submit?.dataset.soldOutLabel ?? "Sold out");

    if (submit) {
      submit.disabled = !match || !match.available;
      submit.textContent = label;
    }

    this.#syncSticky(match, effectivePlan, label);

    if ((match?.id ?? null) !== this.#plansBuiltFor) {
      this.#buildPlans(match, plans, effectivePlan);
      this.#plansBuiltFor = match?.id ?? null;
    }

    this.#markSoldOut(chosen);
  }

  /**
   * Rebuilds the purchase options for a variant (SHO-123).
   *
   * Built from JSON with `textContent`, never HTML strings: plan names are
   * merchant data. A variant with no app-owned plans hides the fieldset, and
   * because a hidden radio is still submitted, one-time is re-checked first.
   *
   * @param {VariantData | undefined} match
   * @param {PlanData[]} plans
   * @param {PlanData | undefined} effectivePlan
   */
  #buildPlans(match, plans, effectivePlan) {
    const { plans: fieldset, planList } = this.refs;
    if (!fieldset || !planList) return;

    /**
     * @param {string} value
     * @param {string} name
     * @param {string} priceText
     */
    const option = (value, name, priceText) => {
      const label = document.createElement("label");
      label.className = "product-form__plan";

      const text = document.createElement("span");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "selling_plan";
      input.value = value;
      input.checked = value === (effectivePlan ? String(effectivePlan.id) : "");
      text.append(input, " ", name);

      const cost = document.createElement("span");
      cost.className = "product-form__plan-price";
      cost.textContent = priceText;

      label.append(text, cost);
      return label;
    };

    planList.replaceChildren(
      option(
        "",
        planList.dataset.oneTimeLabel ?? "One-time purchase",
        match?.price ?? "",
      ),
      ...plans.map((plan) => option(String(plan.id), plan.name, plan.price)),
    );
    fieldset.hidden = plans.length === 0;
  }

  /**
   * Strikes through each pill whose combination, with the other axes as
   * currently chosen, is a real variant that is sold out. The same rule as
   * web; a combination that doesn't exist is not marked (SHO-124).
   *
   * @param {string[]} chosen
   */
  #markSoldOut(chosen) {
    for (const input of this.#optionInputs) {
      const position = Number(input.dataset.optionPosition) - 1;
      const candidate = chosen.map((value, index) =>
        index === position ? input.value : value,
      );
      const variant = this.#find(candidate);
      const soldOut = Boolean(variant && !variant.available);

      const label = input.closest(".product-form__pill");
      label?.classList.toggle("product-form__pill--sold-out", soldOut);
      const note = label?.querySelector("[data-sold-out-note]");
      if (note instanceof HTMLElement) note.hidden = !soldOut;
    }
  }

  /**
   * The sticky bar mirrors the main control from the same #sync call, so it
   * cannot hold a stale copy of the selection.
   *
   * @param {VariantData | undefined} match
   * @param {PlanData | undefined} effectivePlan
   * @param {string} label
   */
  #syncSticky(match, effectivePlan, label) {
    const { stickyBar, stickyDetail, stickySubmit } = this.refs;
    if (!stickyBar) return;

    const title = stickyBar.dataset.productTitle ?? "";
    const variantTitle =
      match && match.options.join(" / ") !== "Default Title"
        ? match.options.join(" / ")
        : "";
    const detail = [variantTitle, effectivePlan?.name].filter(Boolean).join(" · ");
    const priceText = match ? (effectivePlan?.price ?? match.price) : "";

    if (stickyDetail) {
      stickyDetail.textContent = [detail, priceText].filter(Boolean).join(" — ");
    }
    if (stickySubmit) {
      stickySubmit.disabled = !match || !match.available;
      stickySubmit.textContent = label;
      stickySubmit.setAttribute(
        "aria-label",
        [label, title, variantTitle].filter(Boolean).join(", "),
      );
    }
  }

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const data = new FormData(form);
    const variantId = String(data.get("id") ?? "");
    if (!variantId) return;

    const { submit, stickySubmit, status, stickyError } = this.refs;
    if (submit) submit.disabled = true;
    if (stickySubmit) stickySubmit.disabled = true;
    if (status) status.textContent = "";
    if (stickyError) {
      stickyError.textContent = "";
      stickyError.hidden = true;
    }

    try {
      const result = await addItem(
        variantId,
        Number(data.get("quantity") ?? 1),
        String(data.get("selling_plan") ?? ""),
      );

      // The drawer is re-rendered from the response rather than refetched, so
      // the markup a shopper sees is the same Liquid the page would have
      // rendered on a full load.
      replaceCartDrawer(result.sections);
      openCartDrawer();

      if (status) status.textContent = status.dataset.addedLabel ?? "Added to your cart.";
    } catch (error) {
      // Shopify's `description` is written for shoppers — "All 3 Ski Wax are in
      // your cart." — so it is shown rather than replaced with a generic line.
      const message = error instanceof Error ? error.message : "Could not update your cart.";
      if (status) status.textContent = message;
      // The status line sits by the main button, off screen whenever the bar
      // is up, so the bar shows the message too. Not a live region: the
      // status line already announces it.
      if (stickyError) {
        stickyError.textContent = message;
        stickyError.hidden = false;
      }
    } finally {
      // Back to whatever the selection allows, for both buttons, rather than
      // a blanket re-enable.
      this.#sync();
    }
  };
}

customElements.define("product-form", ProductForm);
