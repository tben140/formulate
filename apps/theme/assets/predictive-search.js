import { Component } from "@theme/component";

/**
 * @typedef {object} Refs
 * @property {HTMLInputElement} input - The search box.
 * @property {HTMLElement} list - The listbox the suggestions go into.
 * @property {HTMLElement} status - Announces how many suggestions there are.
 */

/**
 * Same rules as apps/web and the app: PREDICTIVE_SEARCH in
 * packages/shopify/src/predictive-search.ts, which a theme can't import.
 * Change both together.
 */
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 200;
const LIMIT = 6;

/**
 * Product suggestions as you type (SHO-103), matching apps/web's
 * components/predictive-search.tsx.
 *
 * The WAI-ARIA "list autocomplete" combobox: focus stays in the input, arrow
 * keys move the highlight (announced through `aria-activedescendant`), Enter on
 * a highlighted suggestion opens it, Escape closes the list. Enter with nothing
 * highlighted submits the form to the full results page, which is also all
 * this is without JavaScript.
 *
 * Suggestions come from Shopify's `/search/suggest`, rendered by
 * sections/predictive-search.liquid, parsed with DOMParser and adopted as
 * nodes (as pairs-well-with.js does), so the response never runs scripts.
 *
 * @extends Component<Refs>
 */
export class PredictiveSearch extends Component {
  /** @type {AbortController | undefined} */
  #request;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;
  /** The term the list was built for; null while it's empty or stale. */
  /** @type {string | null} */
  #shownFor = null;
  #active = -1;

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    const { input } = this.refs;
    if (!input) return;

    // The term the page was searched for: its results are already showing.
    this.dataset.initialTerm = input.value.trim();

    input.addEventListener("input", this.#onInput, { signal: this.signal });
    input.addEventListener("keydown", this.#onKeydown, { signal: this.signal });
    input.addEventListener("blur", () => this.#close(), { signal: this.signal });
    input.addEventListener(
      "focus",
      () => {
        if (this.#shownFor === input.value.trim() && this.#options.length > 0)
          this.#open();
      },
      { signal: this.signal },
    );
    // mousedown, not click: blur would close the list before the click lands.
    this.refs.list?.addEventListener("mousedown", (event) => event.preventDefault(), {
      signal: this.signal,
    });
  }

  /** @override */
  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
    this.#request?.abort();
  }

  /** @returns {HTMLAnchorElement[]} */
  get #options() {
    return Array.from(this.refs.list?.querySelectorAll('[role="option"]') ?? []);
  }

  #onInput = () => {
    clearTimeout(this.#timer);
    this.#request?.abort();
    const term = this.refs.input.value.trim();

    if (this.#shownFor !== term) this.#close();
    if (term.length < MIN_LENGTH || term === this.dataset.initialTerm) return;

    this.#timer = setTimeout(() => void this.#load(term), DEBOUNCE_MS);
  };

  /** @param {string} term */
  async #load(term) {
    const controller = new AbortController();
    this.#request = controller;
    const url = new URL(
      this.dataset.suggestUrl ?? "/search/suggest",
      window.location.origin,
    );
    url.searchParams.set("q", term);
    url.searchParams.set("resources[type]", "product");
    url.searchParams.set("resources[limit]", String(LIMIT));
    url.searchParams.set("section_id", "predictive-search");

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return;
      const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
      const results = parsed.querySelector("[data-predictive-search-results]");
      if (!results || this.refs.input.value.trim() !== term) return;

      const { list, status } = this.refs;
      list.replaceChildren(
        ...Array.from(results.children, (child) => document.importNode(child, true)),
      );
      this.#shownFor = term;
      this.#active = -1;
      const count = this.#options.length;
      status.textContent =
        count === 0
          ? (this.dataset.noneText ?? "")
          : ((count === 1 ? this.dataset.oneText : this.dataset.manyText)?.replace(
              "[count]",
              String(count),
            ) ?? "");
      if (count > 0) this.#open();
    } catch {
      // Aborted by the next keystroke, or offline: Enter still searches.
    }
  }

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    const options = this.#options;
    const isOpen = this.refs.input.getAttribute("aria-expanded") === "true";

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0 || this.#shownFor !== this.refs.input.value.trim()) return;
      event.preventDefault();
      this.#open();
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.#highlight((this.#active + step + options.length) % options.length);
    } else if (event.key === "Enter") {
      const chosen = isOpen ? options[this.#active] : undefined;
      if (chosen) {
        event.preventDefault();
        window.location.assign(chosen.href);
      }
    } else if (event.key === "Escape" && isOpen) {
      // Only the list: the browser clears a type="search" box on the next Escape.
      event.preventDefault();
      this.#close();
    }
  };

  /** @param {number} index */
  #highlight(index) {
    this.#active = index;
    this.#options.forEach((option, i) => {
      option.setAttribute("aria-selected", String(i === index));
    });
    const option = this.#options[index];
    if (option) {
      this.refs.input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
  }

  #open() {
    this.refs.list.hidden = false;
    this.refs.input.setAttribute("aria-expanded", "true");
  }

  #close() {
    const { list, input } = this.refs;
    if (!list || !input) return;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    this.#active = -1;
    this.#options.forEach((option) => option.setAttribute("aria-selected", "false"));
  }
}

if (!customElements.get("predictive-search")) {
  customElements.define("predictive-search", PredictiveSearch);
}
