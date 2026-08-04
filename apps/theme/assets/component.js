/**
 * @typedef {Record<string, Element | Element[] | undefined>} Refs
 */

/**
 * Base class for this theme's web components.
 *
 * Deliberately small. It provides the two things every component here needs,
 * and nothing else:
 *
 * 1. `refs` — child elements marked `ref="name"`, collected on connect. A
 *    repeated name collects into an array. This replaces scattering
 *    `querySelector` calls through every component.
 *
 * 2. `signal` — an `AbortSignal` tied to the element's lifetime. Register
 *    listeners with `{ signal: this.signal }` and they are removed
 *    automatically when the element leaves the DOM, which is why
 *    `disconnectedCallback` never has to track them by hand.
 *
 * The generic parameter lets a component declare the shape of its own refs, so
 * `this.refs.mainImage` is typed as an image rather than `Element | undefined`.
 * See assets/media-gallery.js for how a subclass declares its own Refs
 * typedef and passes it through.
 *
 * @template {Refs} [T=Refs]
 */
export class Component extends HTMLElement {
  /** @type {T & Refs} */
  refs = /** @type {T & Refs} */ ({});

  #controller = new AbortController();

  /**
   * Aborts when the element is removed from the DOM.
   *
   * @returns {AbortSignal}
   */
  get signal() {
    return this.#controller.signal;
  }

  connectedCallback() {
    this.#collectRefs();
  }

  disconnectedCallback() {
    this.#controller.abort();
  }

  /**
   * Is `element` inside this component rather than inside a nested one?
   *
   * Without this check a component would capture refs belonging to any
   * component nested within it, which silently breaks both.
   *
   * @param {Element} element
   * @returns {boolean}
   */
  #owns(element) {
    let node = element.parentElement;
    while (node && node !== this) {
      if (node instanceof Component) return false;
      node = node.parentElement;
    }
    return node === this;
  }

  #collectRefs() {
    /** @type {Refs} */
    const refs = {};

    for (const element of this.querySelectorAll("[ref]")) {
      const name = element.getAttribute("ref");
      if (!name || !this.#owns(element)) continue;

      const existing = refs[name];
      if (existing === undefined) refs[name] = element;
      else if (Array.isArray(existing)) existing.push(element);
      else refs[name] = [existing, element];
    }

    this.refs = /** @type {T & Refs} */ (refs);
  }
}
