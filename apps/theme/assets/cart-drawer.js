import { Component } from "@theme/component";
import { changeItem } from "@theme/cart-api";

/**
 * @typedef {Object} CartDrawerRefs
 * @property {HTMLButtonElement} [close]
 */

const DRAWER_SECTION = "cart-drawer";

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
    if (this.#dialog && !this.#dialog.open) this.#dialog.showModal();
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

  /** @param {string} message */
  #announce(message) {
    if (!this.#announcer || !message || message === this.#lastAnnounced) return;
    this.#lastAnnounced = message;
    this.#announcer.textContent = message;
  }

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
