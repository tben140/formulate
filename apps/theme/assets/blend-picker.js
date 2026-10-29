import { Component } from "@theme/component";

/**
 * @typedef {object} Refs
 * @property {HTMLInputElement | HTMLInputElement[]} [ingredient]
 * @property {HTMLButtonElement | HTMLButtonElement[]} [preset]
 * @property {HTMLElement} [count]
 * @property {HTMLInputElement} [codes]
 * @property {HTMLInputElement} [label]
 */

/**
 * A daily pack's ingredient picker (custom blend). The rules mirror
 * packages/shopify/src/blend.ts: 2 to `max` ingredients, codes in the range's
 * order, the label built from the range's own names.
 *
 * Picking N checks the form's hidden "N ingredients" option radio and fires
 * its change event, so <product-form> picks the variant, price and purchase
 * options as for any product. Until the choice is complete the add buttons
 * stay disabled.
 *
 * @extends {Component<Refs>}
 */
class BlendPicker extends Component {
  /** @override */
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("change", this.#onChange, { signal: this.signal });
    for (const button of this.#list(this.refs.preset)) {
      button.addEventListener(
        "click",
        () => this.#set((button.dataset.codes ?? "").split(",")),
        { signal: this.signal },
      );
    }
    this.#sync();
  }

  /**
   * @template T
   * @param {T | T[] | undefined} refs
   * @returns {T[]}
   */
  #list(refs) {
    return refs === undefined ? [] : Array.isArray(refs) ? refs : [refs];
  }

  get #max() {
    return Number(this.dataset.max) || 4;
  }

  get #min() {
    return Number(this.dataset.min) || 2;
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
    // Refuse a choice past the largest pack rather than silently dropping one.
    if (input.checked && this.#picked().length > this.#max) input.checked = false;
    this.#sync();
  };

  /** @param {string[]} codes */
  #set(codes) {
    for (const input of this.#list(this.refs.ingredient)) {
      input.checked = codes.includes(input.value);
    }
    this.#sync();
  }

  #picked() {
    return this.#list(this.refs.ingredient).filter((input) => input.checked);
  }

  #sync() {
    const picked = this.#picked();
    const count = picked.length;
    const full = count >= this.#max;

    for (const input of this.#list(this.refs.ingredient)) {
      input
        .closest("label")
        ?.classList.toggle("blend-picker__item--blocked", !input.checked && full);
    }

    if (this.refs.codes)
      this.refs.codes.value = picked.map((input) => input.value).join(",");
    if (this.refs.label) {
      this.refs.label.value = picked.map((input) => input.dataset.shortName).join(" + ");
    }
    if (this.refs.count) {
      this.refs.count.textContent =
        `${count} of up to ${this.#max} chosen` +
        (count < this.#min ? `. Choose at least ${this.#min}.` : ".");
    }

    // Select the matching pack through the form's own option radio.
    const form = this.closest("form");
    const size = Math.max(count, this.#min);
    const radio = form?.querySelector(
      `input[data-option-position="1"][value="${size} ingredients"]`,
    );
    if (radio instanceof HTMLInputElement && !radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // After <product-form> has synced: block the add until the choice fits.
    const ready = count >= this.#min && count <= this.#max;
    this.dataset.ready = String(ready);
    for (const button of form?.querySelectorAll(
      'button[type="submit"], [ref="stickySubmit"]',
    ) ?? []) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (!ready) {
        button.disabled = true;
        button.textContent = `Choose ${this.#min} to ${this.#max} ingredients`;
      } else if (button.disabled && button.textContent?.startsWith("Choose ")) {
        button.disabled = false;
        button.textContent = button.dataset.addLabel ?? "Add to cart";
      }
    }
  }
}

if (!customElements.get("blend-picker"))
  customElements.define("blend-picker", BlendPicker);
