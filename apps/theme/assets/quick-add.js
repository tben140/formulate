import { addItem } from "@theme/cart-api";
import { openCartDrawer, replaceCartDrawer } from "@theme/cart-drawer";
import { Component } from "@theme/component";

/**
 * @typedef {{ button?: HTMLButtonElement, status?: HTMLElement }} QuickAddRefs
 */

/**
 * Add to cart from a product card (snippets/product-grid.liquid), for a
 * product with one variant: a one-time purchase, as cardOffer does on web and
 * the app. Without JavaScript the form posts to /cart/add and Shopify takes
 * the shopper to the cart.
 *
 * @extends {Component<QuickAddRefs>}
 */
class QuickAdd extends Component {
  #adding = false;

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    const form = this.querySelector("form");
    form?.addEventListener("submit", (event) => this.#add(event, form), {
      signal: this.signal,
    });
  }

  /**
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   */
  async #add(event, form) {
    event.preventDefault();
    // aria-disabled, not disabled, so focus stays on the button (SHO-134).
    if (this.#adding) return;
    this.#adding = true;
    const { button, status } = this.refs;
    button?.setAttribute("aria-disabled", "true");
    if (status) status.textContent = "";

    try {
      const data = new FormData(form);
      const result = await addItem(String(data.get("id") ?? ""), 1);
      replaceCartDrawer(result.sections);
      openCartDrawer();
      if (status) status.textContent = status.dataset.addedLabel ?? "Added to your cart.";
    } catch (error) {
      if (status) {
        status.textContent =
          error instanceof Error ? error.message : "Could not update your cart.";
      }
    } finally {
      this.#adding = false;
      button?.removeAttribute("aria-disabled");
    }
  }
}

if (!customElements.get("quick-add")) customElements.define("quick-add", QuickAdd);
