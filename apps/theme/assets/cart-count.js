import { Component } from "@theme/component";
import { openCartDrawer } from "@theme/cart-drawer";

/**
 * @typedef {Object} CartCountRefs
 * @property {HTMLAnchorElement} [link]
 * @property {HTMLElement} [badge]
 */

/**
 * The header cart button.
 *
 * Progressive enhancement, again: the markup is an anchor to /cart, which is a
 * real page. This turns it into a drawer trigger and keeps the badge in step.
 *
 * It listens for `cart:updated` rather than fetching anything. The count rides
 * along in the same response that re-renders the drawer, so a mutation costs
 * exactly one request no matter how many things need to know about it.
 *
 * @extends {Component<CartCountRefs>}
 */
class CartCount extends Component {
  /** @override */
  connectedCallback() {
    super.connectedCallback();

    this.refs.link?.addEventListener(
      "click",
      (event) => {
        // Let modified clicks through — cmd-click to open the cart page in a
        // new tab should still work, as it would for any link.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        openCartDrawer();
      },
      { signal: this.signal },
    );

    document.addEventListener("cart:updated", this.#onCartUpdated, {
      signal: this.signal,
    });
  }

  /** @param {Event} event */
  #onCartUpdated = (event) => {
    if (!(event instanceof CustomEvent)) return;

    const count = Number(event.detail?.itemCount ?? 0);
    const { badge, link } = this.refs;

    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }

    // The visible badge reads "2", which a screen reader announces as
    // "Cart two". The label says what the number means, and has to move with
    // it or it goes stale the moment anything is added.
    if (link) {
      link.setAttribute(
        "aria-label",
        count === 1
          ? "Open cart, 1 item"
          : count === 0
            ? "Open cart, empty"
            : `Open cart, ${count} items`,
      );
    }
  };
}

customElements.define("cart-count", CartCount);
