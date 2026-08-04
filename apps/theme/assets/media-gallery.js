import { Component } from "@theme/component";

/**
 * @typedef {object} Refs
 * @property {HTMLImageElement} [mainImage] - The large image being displayed.
 * @property {HTMLButtonElement[] | HTMLButtonElement} [thumbnail] - Thumbnail buttons.
 */

/**
 * Product media gallery.
 *
 * Swaps the main image when a thumbnail is chosen, and implements roving
 * tabindex so the thumbnail strip behaves as a single tab stop with arrow-key
 * navigation between items — the expected pattern for a group of related
 * controls, rather than making a keyboard user tab through every thumbnail.
 *
 * Progressive enhancement: the markup renders a usable gallery with the first
 * image shown and every thumbnail a real link target before this runs. If the
 * script fails, the product image is still visible.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  /** @override */
  connectedCallback() {
    super.connectedCallback();

    const thumbnails = this.#thumbnails;
    if (thumbnails.length === 0) return;

    thumbnails.forEach((thumbnail, index) => {
      thumbnail.addEventListener("click", () => this.#select(index), {
        signal: this.signal,
      });
    });

    this.addEventListener("keydown", this.#handleKeydown, { signal: this.signal });

    this.#select(0);
  }

  /** @returns {HTMLButtonElement[]} */
  get #thumbnails() {
    const { thumbnail } = this.refs;
    if (!thumbnail) return [];
    return Array.isArray(thumbnail) ? thumbnail : [thumbnail];
  }

  /**
   * @param {KeyboardEvent} event
   */
  #handleKeydown = (event) => {
    const thumbnails = this.#thumbnails;
    const current = thumbnails.findIndex((t) => t === document.activeElement);
    if (current === -1) return;

    const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (offset === undefined) return;

    event.preventDefault();

    // Wraps at both ends, so the strip is a loop rather than a dead end.
    const next = (current + offset + thumbnails.length) % thumbnails.length;
    this.#select(next);
    thumbnails[next]?.focus();
  };

  /**
   * @param {number} index
   */
  #select(index) {
    const thumbnails = this.#thumbnails;
    const chosen = thumbnails[index];
    const main = this.refs.mainImage;
    if (!chosen || !main) return;

    const { src, srcset, alt } = chosen.dataset;
    if (src) main.src = src;
    if (srcset) main.srcset = srcset;
    main.alt = alt ?? "";

    thumbnails.forEach((thumbnail, i) => {
      const selected = i === index;
      thumbnail.setAttribute("aria-current", String(selected));
      // Roving tabindex: only the selected thumbnail is reachable by Tab.
      thumbnail.tabIndex = selected ? 0 : -1;
    });
  }
}

if (!customElements.get("media-gallery")) {
  customElements.define("media-gallery", MediaGallery);
}
