import { Component } from "@theme/component";
import { addItem, changeItem } from "@theme/cart-api";

/**
 * @typedef {Object} CartDrawerRefs
 * @property {HTMLButtonElement} [close]
 */

const DRAWER_SECTION = "cart-drawer";
const SUGGESTIONS_SECTION = "cart-recommendations";

/** The storefront's root, "/" or a locale prefix such as "/fr/". */
const ROOT =
  /** @type {{ Shopify?: { routes?: { root?: string } } }} */ (window).Shopify?.routes
    ?.root ?? "/";

/**
 * The free-delivery sentence in rendered drawer markup, or "" when the bar is
 * not showing.
 *
 * @param {ParentNode | null} root
 * @returns {string}
 */
const freeShippingMessage = (root) =>
  root?.querySelector("[data-free-shipping-message]")?.textContent?.trim() ?? "";

/**
 * The slide-in cart.
 *
 * The panel itself is a native `<dialog>` opened with `showModal()`, exactly as
 * apps/web does it — focus trapping, Escape, page inerting and a real
 * `::backdrop` all come from the platform rather than from code here.
 *
 * The contents are Liquid, re-rendered by the Section Rendering API and swapped
 * in. Nothing in this file builds markup.
 *
 * @extends {Component<CartDrawerRefs>}
 */
class CartDrawer extends Component {
  /** @type {HTMLDialogElement | null} */
  #dialog = null;

  /**
   * A polite live region that lives for as long as the drawer does.
   *
   * The drawer's contents are replaced wholesale on every change, and a live
   * region that arrives already filled in is often not announced. So the
   * free-delivery sentence is copied into this one, which is never replaced,
   * and only its text changes.
   *
   * @type {HTMLParagraphElement | null}
   */
  #announcer = null;

  /** @override */
  connectedCallback() {
    super.connectedCallback();

    this.#dialog = this.querySelector("dialog");

    // Inside the dialog, not beside it: a modal dialog makes everything outside
    // it inert, live regions included.
    this.#announcer = document.createElement("p");
    this.#announcer.className = "visually-hidden";
    this.#announcer.setAttribute("role", "status");
    this.#dialog?.prepend(this.#announcer);

    // Seeded silently from the first render, so only a later *change* is
    // announced — never the message that was already there on page load.
    this.#lastAnnounced = freeShippingMessage(this.#dialog);

    this.addEventListener("click", this.#onClick, { signal: this.signal });
    this.addEventListener("submit", this.#onSubmit, { signal: this.signal });

    void this.#loadSuggestions();

    // A click landing on the dialog element itself is a click on the backdrop:
    // the element fills the viewport, the visible panel is a child of it.
    this.#dialog?.addEventListener(
      "click",
      (event) => {
        if (event.target === this.#dialog) this.close();
      },
      { signal: this.signal },
    );
  }

  open() {
    if (!this.#dialog || this.#dialog.open) return;
    this.#dialog.showModal();

    // A change made while the drawer was closed (the product page updates it
    // and then opens it) is spoken now. Cleared and set a frame later, so the
    // live region sees a real change once the dialog is in the
    // accessibility tree.
    const pending = this.#pendingAnnouncement;
    if (pending === null || !this.#announcer) return;
    this.#pendingAnnouncement = null;
    const announcer = this.#announcer;
    announcer.textContent = "";
    requestAnimationFrame(() => {
      announcer.textContent = pending;
    });
  }

  close() {
    if (this.#dialog?.open) this.#dialog.close();
  }

  /**
   * Swaps in freshly rendered Liquid and tells the header its new count.
   *
   * Parsed with `DOMParser` and adopted as nodes rather than assigned through
   * `innerHTML`. Two reasons, and the second is the important one:
   *
   * 1. `innerHTML` would mean parsing the markup twice — once to find the
   *    section, once to insert it.
   * 2. `DOMParser` builds an **inert** document. Scripts in it never run, and
   *    moving those nodes into the live document does not run them either.
   *    `innerHTML` is inert for `<script>` too, but not for markup that
   *    executes on insertion, so adopting nodes keeps the safe property
   *    explicit rather than incidental.
   *
   * The content is Shopify rendering our own Liquid, so this is not untrusted
   * input in the usual sense — but a cart carries line-item properties and
   * product titles, and Liquid does not escape by default. Not handing any of
   * it to a parser that can execute is the cheap correct habit.
   *
   * @param {string} html Rendered `sections/cart-drawer.liquid`.
   */
  replace(html) {
    const dialog = this.#dialog;
    if (!dialog) return;

    const parsed = new DOMParser().parseFromString(html, "text/html");
    const next = parsed.querySelector(".cart-drawer-section");
    if (!next) return;

    // The dialog element itself survives, so its open state, its position in
    // the top layer and any running transition are all preserved — only the
    // section changes. The announcer beside it is left alone on purpose.
    const current = dialog.querySelector(".cart-drawer-section");
    const imported = document.importNode(next, true);
    if (current) current.replaceWith(imported);
    else dialog.append(imported);

    this.#announce(freeShippingMessage(imported));
    void this.#loadSuggestions();

    // The count lives in the swapped markup, so the header updates from the
    // same response. No second request for a number already in hand.
    const count = next.getAttribute("data-item-count");
    if (count !== null) {
      document.dispatchEvent(
        new CustomEvent("cart:updated", { detail: { itemCount: Number(count) } }),
      );
    }
  }

  /** @type {string} */
  #lastAnnounced = "";

  /** Bumped per request, so a slow response for an older cart is dropped. */
  #suggestionsRequest = 0;

  /**
   * Fills the drawer's suggestions slot from sections/cart-recommendations.liquid
   * (SHO-116), rendered by Shopify's recommendations endpoint for the cart's
   * first line.
   *
   * Markup still comes from Liquid, as everywhere else in this file: the
   * response is parsed inertly and its nodes adopted. A failed request leaves
   * the slot empty. Suggestions are an extra, and must never break the cart.
   */
  async #loadSuggestions() {
    const section = this.#dialog?.querySelector(".cart-drawer-section");
    const slot = section?.querySelector("[data-cart-suggestions]");
    const productId = section?.getAttribute("data-recommend-from");
    if (!slot || !productId) return;

    const request = ++this.#suggestionsRequest;
    const params = new URLSearchParams({
      product_id: productId,
      limit: "10",
      intent: "related",
      section_id: SUGGESTIONS_SECTION,
    });

    try {
      const response = await fetch(`${ROOT}recommendations/products?${params}`);
      if (!response.ok) return;
      const html = await response.text();
      if (request !== this.#suggestionsRequest) return;

      const parsed = new DOMParser().parseFromString(html, "text/html");
      const content = parsed.querySelector(".cart-suggestions");
      slot.replaceChildren(...(content ? [document.importNode(content, true)] : []));
    } catch {
      // Leave the slot as it is; see above.
    }
  }

  /**
   * An empty message (the cart was emptied, so the bar is gone) clears the
   * region without announcing anything. Otherwise the old sentence would linger
   * for a screen reader moving through the drawer.
   *
   * @param {string} message
   */
  #announce(message) {
    if (!this.#announcer || message === this.#lastAnnounced) return;
    this.#lastAnnounced = message;

    // A closed dialog is hidden, so a live region inside it isn't announced,
    // and the message would then count as said (review of #27). Held until
    // open() instead.
    if (!this.#dialog?.open) {
      this.#pendingAnnouncement = message;
      return;
    }
    this.#pendingAnnouncement = null;
    this.#announcer.textContent = message;
  }

  /**
   * A message from a change made while the drawer was closed, waiting for
   * open().
   *
   * @type {string | null}
   */
  #pendingAnnouncement = null;

  /** @param {Event} event */
  #onClick = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".cart-drawer__close")) this.close();
  };

  /**
   * Intercepts the quantity and remove forms.
   *
   * Both are real forms posting to /cart/change, so with JavaScript off they
   * submit and Shopify redirects to the cart page. This turns them into an
   * in-place update.
   *
   * @param {SubmitEvent} event
   */
  #onSubmit = async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    // The checkout form must post normally — that handoff belongs to Shopify.
    if (form.querySelector('[name="checkout"]')) return;

    event.preventDefault();

    if (form.hasAttribute("data-cart-suggestion-add")) {
      await this.#addSuggestion(form);
      return;
    }

    const data = new FormData(form);
    const key = String(data.get("id") ?? "");
    if (!key) return;

    try {
      const result = await changeItem(key, Number(data.get("quantity") ?? 0));
      this.replace(result.sections?.[DRAWER_SECTION] ?? "");
    } catch {
      // A failed quantity change leaves the drawer showing the previous state,
      // which is accurate — the change did not happen. Reloading would be
      // worse: it would close the drawer and lose the shopper's place.
    }
  };

  /**
   * One-tap add from a suggestion. The drawer stays open and is re-rendered
   * in place, which also refreshes the suggestions without the one just added.
   *
   * The button stays focusable while the add runs (aria-disabled, not
   * disabled) for the reason given in product-form.js (SHO-134).
   *
   * @param {HTMLFormElement} form
   */
  async #addSuggestion(form) {
    const button = form.querySelector("button");
    if (button?.getAttribute("aria-disabled") === "true") return;
    button?.setAttribute("aria-disabled", "true");

    const variantId = String(new FormData(form).get("id") ?? "");
    try {
      const result = await addItem(variantId, 1, "");
      this.replace(result.sections?.[DRAWER_SECTION] ?? "");
    } catch {
      // As with quantity changes: the drawer still shows the true state.
      button?.removeAttribute("aria-disabled");
    }
  }
}

customElements.define("cart-drawer", CartDrawer);

/** @returns {CartDrawer | null} */
const drawer = () => document.querySelector("cart-drawer");

export const openCartDrawer = () => drawer()?.open();

/**
 * @param {Record<string, string> | undefined} sections
 */
export const replaceCartDrawer = (sections) => {
  const html = sections?.[DRAWER_SECTION];
  if (html) drawer()?.replace(html);
};
