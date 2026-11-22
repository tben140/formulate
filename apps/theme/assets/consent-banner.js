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
  /** @type {CustomerPrivacy | undefined} */
  #privacy;

  /** @override */
  connectedCallback() {
    super.connectedCallback();

    this.refs.accept?.addEventListener("click", () => this.#choose(true), {
      signal: this.signal,
    });
    this.refs.decline?.addEventListener("click", () => this.#choose(false), {
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

    void loadCustomerPrivacy().then((privacy) => {
      this.#privacy = privacy;
      // No API (the preview editor, a blocked script): leave it as painted.
      if (!privacy) return;
      if (previewing()) {
        this.hidden = false;
        return;
      }
      const needed = privacy.shouldShowBanner();
      remember(!needed);
      this.hidden = !needed;
    });
  }

  #show() {
    this.hidden = false;
    this.refs.accept?.focus();
  }

  /** @param {boolean} granted */
  #choose(granted) {
    const privacy = this.#privacy;
    if (!privacy) return;
    for (const button of [this.refs.accept, this.refs.decline])
      if (button) button.disabled = true;
    privacy.setTrackingConsent(
      {
        analytics: granted,
        marketing: granted,
        preferences: granted,
        sale_of_data: granted,
      },
      (result) => {
        for (const button of [this.refs.accept, this.refs.decline])
          if (button) button.disabled = false;
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
