/**
 * The home hero's slides (SHO-203), as apps/web's HeroSlider. Liquid renders
 * every slide with all but the first `hidden`, so without JavaScript the
 * first slide simply shows. This adds the controls:
 *
 * - it plays by itself (every 7 s) only without `prefers-reduced-motion`,
 *   and holds while the pointer or keyboard focus is inside; Pause stops it
 *   for good (WCAG 2.2.2), Play starts it, even with reduced motion;
 * - Previous, Next and a button per slide;
 * - slides out of view stay `hidden`: out of the tab order and the
 *   accessibility tree.
 */
const INTERVAL_MS = 7000;

class HeroSlider extends HTMLElement {
  /** @type {HTMLElement[]} */
  #slides = [];
  /** @type {HTMLButtonElement[]} */
  #dots = [];
  #index = 0;
  /** @type {boolean | null} */
  #chosen = null;
  #held = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #timer;
  #reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  connectedCallback() {
    this.#slides = [...this.querySelectorAll("[data-slide]")].filter(
      (el) => el instanceof HTMLElement,
    );
    if (this.#slides.length < 2) return;
    this.#dots = [...this.querySelectorAll("[data-dot]")].filter(
      (el) => el instanceof HTMLButtonElement,
    );
    // Shown, not inserted: their space is already reserved, so nothing moves.
    this.dataset.ready = "";

    this.querySelector("[data-prev]")?.addEventListener("click", () =>
      this.#go(this.#index - 1),
    );
    this.querySelector("[data-next]")?.addEventListener("click", () =>
      this.#go(this.#index + 1),
    );
    this.#dots.forEach((dot, i) => dot.addEventListener("click", () => this.#go(i)));
    this.querySelector("[data-play]")?.addEventListener("click", () => {
      this.#chosen = !this.#autoplay;
      this.#sync();
    });

    this.addEventListener("mouseenter", () => this.#hold(true));
    this.addEventListener("mouseleave", () => this.#hold(false));
    this.addEventListener("focusin", () => this.#hold(true));
    this.addEventListener("focusout", (event) => {
      if (!(event.relatedTarget instanceof Node && this.contains(event.relatedTarget)))
        this.#hold(false);
    });
    this.#reduced.addEventListener("change", () => this.#sync());
    this.#sync();
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
  }

  get #autoplay() {
    return this.#chosen ?? !this.#reduced.matches;
  }

  /** @param {boolean} held */
  #hold(held) {
    this.#held = held;
    this.#sync();
  }

  /** @param {number} next */
  #go(next) {
    const count = this.#slides.length;
    this.#index = (next + count) % count;
    this.#slides.forEach((slide, i) => {
      slide.hidden = i !== this.#index;
    });
    this.#dots.forEach((dot, i) => {
      if (i === this.#index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  #sync() {
    const play = this.querySelector("[data-play]");
    if (play instanceof HTMLButtonElement) {
      play.textContent =
        (this.#autoplay ? play.dataset.pauseLabel : play.dataset.playLabel) ?? "";
    }
    clearInterval(this.#timer);
    if (this.#autoplay && !this.#held) {
      this.#timer = setInterval(() => this.#go(this.#index + 1), INTERVAL_MS);
    }
  }
}

if (!customElements.get("hero-slider")) customElements.define("hero-slider", HeroSlider);
