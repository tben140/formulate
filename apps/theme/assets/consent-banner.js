import { Component } from "@theme/component";

/**
 * @typedef {Object} ConsentBannerRefs
 * @property {HTMLButtonElement} [accept]
 * @property {HTMLButtonElement} [decline]
 */

/**
 * Set once the visitor has chosen, so the next page can hide the banner
 * before it paints (the inline script in snippets/consent-banner.liquid).
 * Shopify's API is still the authority: it's asked on every page, and shows
 * the banner again if the recorded choice has gone.
 */
export const DECIDED_KEY = "dh-consent-decided";

/**
 * Shows the banner whatever the API says, for Lighthouse: CI's runners are in
 * the US, where Shopify's API says no banner is needed, but the store's
 * shoppers are in the UK, where it is. scripts/lighthouse-login.cjs sets it,
 * so CI measures the page a UK visitor gets. Only this browser is affected.
 */
export const PREVIEW_KEY = "dh-consent-preview";

const previewing = () => {
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
};

/** @param {boolean} decided */
const remember = (decided) => {
  try {
    if (decided) localStorage.setItem(DECIDED_KEY, "1");
    else localStorage.removeItem(DECIDED_KEY);
  } catch {
    // Storage blocked: the banner just shows until the API says otherwise.
  }
};

/** @returns {Promise<CustomerPrivacy | undefined>} */
const loadCustomerPrivacy = () =>
  new Promise((resolve) => {
    const shopify = window.Shopify;
    if (shopify?.customerPrivacy) return resolve(shopify.customerPrivacy);
    if (!shopify?.loadFeatures) return resolve(undefined);
    shopify.loadFeatures([{ name: "consent-tracking-api", version: "0.1" }], (error) =>
      resolve(error ? undefined : window.Shopify?.customerPrivacy),
    );
  });

/**
 * The theme's own cookie banner, writing the choice through Shopify's
 * Customer Privacy API, the same record Shopify's banner writes and Klaviyo's
 * app embed and Shopify's pixels read.
 *
 * Why not Shopify's banner: it's injected by script about 4 s into the load,
 * and on a phone collection page its text block is bigger than any product
 * photo, so it becomes the page's Largest Contentful Paint and fails the
 * Lighthouse budget (#148). This one is in the HTML, so it paints with the
 * page. It matches apps/web's banner: the same words, Decline and Accept with
 * equal weight, and a footer link to change your mind.
 *
 * @extends {Component<ConsentBannerRefs>}
 */
class ConsentBanner extends Component {
  /** @type {Promise<CustomerPrivacy | undefined> | undefined} */
  #loading;

  /** The shopper opened it from the footer, so the API mustn't close it. */
  #reopened = false;

  /** @override */
  connectedCallback() {
    super.connectedCallback();

    this.refs.accept?.addEventListener("click", () => void this.#choose(true), {
      signal: this.signal,
    });
    this.refs.decline?.addEventListener("click", () => void this.#choose(false), {
      signal: this.signal,
    });
    // The footer's "Cookie preferences", wherever it is on the page.
    document.addEventListener(
      "click",
      (event) => {
        const target = /** @type {Element | null} */ (event.target);
        if (target?.closest("[data-consent-reopen]")) this.#show();
      },
      { signal: this.signal },
    );

    void this.#load().then((privacy) => {
      // No API (the preview editor, a blocked script): leave it as painted.
      if (!privacy) return;
      if (previewing()) {
        this.hidden = false;
        return;
      }
      const needed = privacy.shouldShowBanner();
      remember(!needed);
      if (!this.#reopened) this.hidden = !needed;
    });
  }

  /** The API, loaded once; if loading fails, the next reopen or choice tries again. */
  #load() {
    this.#loading ??= loadCustomerPrivacy().then((privacy) => {
      if (!privacy) this.#loading = undefined;
      return privacy;
    });
    return this.#loading;
  }

  #show() {
    this.#reopened = true;
    this.hidden = false;
    this.refs.accept?.focus();
    void this.#load();
  }

  /**
   * A choice made while the API is still loading waits for it, with both
   * buttons disabled, rather than being dropped. If it can't load, the
   * buttons come back and the banner stays, so nothing looks saved.
   * @param {boolean} granted
   */
  async #choose(granted) {
    const buttons = [this.refs.accept, this.refs.decline];
    /** @param {boolean} busy */
    const busy = (busy) => {
      for (const button of buttons) if (button) button.disabled = busy;
      this.toggleAttribute("aria-busy", busy);
    };
    busy(true);
    const privacy = await this.#load();
    if (!privacy) return busy(false);
    privacy.setTrackingConsent(
      {
        analytics: granted,
        marketing: granted,
        preferences: granted,
        sale_of_data: granted,
      },
      (result) => {
        busy(false);
        if (result?.error) return;
        remember(true);
        this.hidden = true;
      },
    );
  }
}

if (!customElements.get("consent-banner")) {
  customElements.define("consent-banner", ConsentBanner);
}
