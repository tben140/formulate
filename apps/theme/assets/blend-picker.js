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
 * Picking N sets `data-size` and `data-ready`, then fires `blend:change`.
 * <product-form> picks the variant whose `blendSize` is N (never the option
 * title, which a merchant can rename), and keeps the add buttons disabled,
 * with `data-incomplete-label`, until the choice is complete.
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

    // Set before <product-form> hears of it: it reads both in its #sync.
    this.dataset.size = String(Math.max(count, this.#min));
    this.dataset.ready = String(count >= this.#min && count <= this.#max);
    this.dispatchEvent(new Event("blend:change", { bubbles: true }));
  }
}

if (!customElements.get("blend-picker"))
  customElements.define("blend-picker", BlendPicker);
