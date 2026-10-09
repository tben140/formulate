import { Component } from "@theme/component";

/**
 * @typedef {object} Refs
 * @property {HTMLElement} [track] - The scroll-snapping row of images.
 * @property {HTMLButtonElement} [previous] - Previous-image arrow.
 * @property {HTMLButtonElement} [next] - Next-image arrow.
 * @property {HTMLElement} [count] - The "2 / 5" badge, a polite live region.
 * @property {HTMLElement} [countText] - Its screen-reader wording.
 * @property {HTMLElement} [countShort] - Its visible "2 / 5".
 * @property {HTMLButtonElement[] | HTMLButtonElement} [thumbnail] - Thumbnail buttons.
 */

/**
 * Product media gallery (sections/product.liquid), matching apps/web's
 * components/product-gallery.tsx.
 *
 * Every image is already in a scroll-snapping track, so without this script the
 * gallery still swipes on touch and scrolls with a trackpad. This adds:
 *
 * - arrows (wider screens) and a position count, which wrap at both ends;
 * - thumbnails that scroll the track to their image, kept in step with
 *   wherever the track has been swiped;
 * - roving tabindex on the thumbnails, so the strip is one Tab stop with
 *   arrow keys between items, the expected pattern for a group of related
 *   controls.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  #active = 0;

  /** @override */
  connectedCallback() {
    super.connectedCallback();

    const { track, previous, next, count } = this.refs;
    const slides = this.#slides;
    if (!track || slides.length < 2) return;

    previous?.removeAttribute("hidden");
    next?.removeAttribute("hidden");
    count?.removeAttribute("hidden");

    previous?.addEventListener("click", () => this.#show(this.#active - 1), {
      signal: this.signal,
    });
    next?.addEventListener("click", () => this.#show(this.#active + 1), {
      signal: this.signal,
    });
    this.#thumbnails.forEach((thumbnail, index) => {
      thumbnail.addEventListener("click", () => this.#show(index), {
        signal: this.signal,
      });
    });
    track.addEventListener("scroll", this.#handleScroll, {
      passive: true,
      signal: this.signal,
    });
    this.addEventListener("keydown", this.#handleKeydown, { signal: this.signal });

    this.#mark(0);
  }

  /** @returns {HTMLElement[]} */
  get #slides() {
    return Array.from(this.refs.track?.querySelectorAll(".product__slide") ?? []);
  }

  /** @returns {HTMLButtonElement[]} */
  get #thumbnails() {
    const { thumbnail } = this.refs;
    if (!thumbnail) return [];
    return Array.isArray(thumbnail) ? thumbnail : [thumbnail];
  }

  /** Which image is in view, from the scroll position: swipes, trackpads and buttons alike. */
  #handleScroll = () => {
    const { track } = this.refs;
    if (!track) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    const clamped = Math.min(Math.max(index, 0), this.#slides.length - 1);
    if (clamped !== this.#active) this.#mark(clamped);
  };

  /**
   * Arrow keys move between thumbnails (roving tabindex) and bring the image
   * with them. On the focused track itself the browser scrolls natively.
   *
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
    const target = (current + offset + thumbnails.length) % thumbnails.length;
    this.#show(target);
    thumbnails[target]?.focus();
  };

  /** @param {number} index - wraps at both ends */
  #show(index) {
    const { track } = this.refs;
    const total = this.#slides.length;
    if (!track || total === 0) return;
    const target = (index + total) % total;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({
      left: target * track.clientWidth,
      behavior: reduced ? "auto" : "smooth",
    });
    this.#mark(target);
  }

  /**
   * Updates the count, the track's label and the thumbnails for `index`.
   *
   * @param {number} index
   */
  #mark(index) {
    this.#active = index;
    const total = this.#slides.length;
    const position = (this.dataset.positionText ?? "[index] / [count]")
      .replace("[index]", String(index + 1))
      .replace("[count]", String(total));

    const { track, countText, countShort } = this.refs;
    if (countText) countText.textContent = position;
    if (countShort) countShort.textContent = `${index + 1} / ${total}`;
    track?.setAttribute("aria-label", position);

    this.#thumbnails.forEach((thumbnail, i) => {
      const selected = i === index;
      if (selected) thumbnail.setAttribute("aria-current", "true");
      else thumbnail.removeAttribute("aria-current");
      // Roving tabindex: only the selected thumbnail is reachable by Tab.
      thumbnail.tabIndex = selected ? 0 : -1;
    });
    this.#thumbnails[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

if (!customElements.get("media-gallery")) {
  customElements.define("media-gallery", MediaGallery);
}
