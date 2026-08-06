import { Component } from "@theme/component";
import { addItem } from "@theme/cart-api";
import { openCartDrawer, replaceCartDrawer } from "@theme/cart-drawer";

/**
 * @typedef {Object} VariantData
 * @property {number} id
 * @property {boolean} available
 * @property {string[]} options Option values, in the product's option order.
 * @property {string} price Already formatted by Liquid's `money` filter.
 */

/**
 * @typedef {Object} ProductFormRefs
 * @property {HTMLInputElement} [variantId]
 * @property {HTMLElement} [price]
 * @property {HTMLButtonElement} [submit]
 * @property {HTMLElement} [status]
 * @property {HTMLInputElement | HTMLInputElement[]} [optionInput]
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
  }

  /** The option pills, as a flat array regardless of how many there are. */
  get #optionInputs() {
    const refs = this.refs.optionInput;
    if (!refs) return [];
    return Array.isArray(refs) ? refs : [refs];
  }

  /**
   * Resolves the checked pills to a variant and updates the form.
   *
   * Mirrors `findVariantByOptions` in packages/shopify: an exact match on every
   * axis, and no match rather than a guess. A combination that does not exist
   * disables the button instead of silently adding something else.
   *
   * @param {Event} event
   */
  #onChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.name === "selling_plan") return;

    const chosen = this.#optionInputs
      .filter((input) => input.checked)
      .sort((a, b) => Number(a.dataset.optionPosition) - Number(b.dataset.optionPosition))
      .map((input) => input.value);

    const match = this.#variants.find(
      (variant) =>
        variant.options.length === chosen.length &&
        variant.options.every((value, index) => value === chosen[index]),
    );

    const { variantId, price, submit } = this.refs;

    if (variantId) variantId.value = match ? String(match.id) : "";
    if (price && match) price.textContent = match.price;

    if (submit) {
      submit.disabled = !match || !match.available;
      submit.textContent = !match
        ? (submit.dataset.unavailableLabel ?? "Unavailable")
        : match.available
          ? (submit.dataset.addLabel ?? "Add to cart")
          : (submit.dataset.soldOutLabel ?? "Sold out");
    }
  };

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const data = new FormData(form);
    const variantId = String(data.get("id") ?? "");
    if (!variantId) return;

    const { submit, status } = this.refs;
    if (submit) submit.disabled = true;
    if (status) status.textContent = "";

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
      if (status) {
        status.textContent =
          error instanceof Error ? error.message : "Could not update your cart.";
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  };
}

customElements.define("product-form", ProductForm);
