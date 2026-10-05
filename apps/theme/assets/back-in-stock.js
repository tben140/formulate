import { Component } from "@theme/component";

/**
 * @typedef {Object} BackInStockRefs
 * @property {HTMLInputElement} [input]
 * @property {HTMLButtonElement} [submit]
 * @property {HTMLElement} [message]
 * @property {HTMLElement} [hint]
 */

/**
 * ⚠️ Duplicated from packages/analytics, as in email-capture.js: the theme has
 * no build step to import it. Change one, change the other.
 */
const KLAVIYO_REVISION = "2026-07-15";

/** @param {string} value */
const isPlausibleEmail = (value) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim());

/**
 * "Email me when it's back" (SHO-118), the theme's counterpart of apps/web's
 * <BackInStockForm />; the request matches `submitBackInStock` in
 * packages/analytics. Posts to Klaviyo's client endpoint with the public key.
 *
 * Follows the selected variant through product-form's
 * `product-form:variant-change` event: shown while it's sold out, with the
 * hint naming it.
 *
 * Unlike the footer form there's no `identify`: a restock alert isn't consent
 * to tracking any more than to marketing.
 *
 * @extends {Component<BackInStockRefs>}
 */
class BackInStock extends Component {
  /** @override */
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("submit", this.#onSubmit, { signal: this.signal });
    this.addEventListener("input", this.#clear, { signal: this.signal });
    document.addEventListener("product-form:variant-change", this.#onVariantChange, {
      signal: this.signal,
    });
  }

  /** @param {Event} event */
  #onVariantChange = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail;
    const soldOut = Boolean(detail && !detail.available);
    this.hidden = !soldOut;
    if (!soldOut) return;
    if (String(detail.id) === this.dataset.variantId) return;

    // A different sold-out variant: name it, and start the form afresh.
    this.dataset.variantId = String(detail.id);
    const product = this.dataset.productTitle ?? "";
    const item =
      detail.title === "Default Title" ? product : `${product}, ${detail.title}`;
    const { hint, input } = this.refs;
    if (hint)
      hint.textContent = (this.dataset.hintTemplate ?? "").replace("%ITEM%", item);
    if (input) input.value = "";
    this.#clear();
  };

  #clear = () => {
    const { message, input } = this.refs;
    if (!message || !message.textContent) return;
    message.textContent = "";
    message.classList.remove("back-in-stock__message--error");
    input?.removeAttribute("aria-invalid");
  };

  /** @param {Event} event */
  #onSubmit = async (event) => {
    event.preventDefault();
    const { input, submit } = this.refs;
    if (!input) return;

    const email = input.value.trim();
    if (email === "") return this.#report(this.dataset.errorEmpty ?? "", true);
    if (!isPlausibleEmail(email))
      return this.#report(this.dataset.errorInvalid ?? "", true);

    const publicKey = this.dataset.publicKey ?? "";
    const variantId = this.dataset.variantId ?? "";
    if (!publicKey || !/^\d+$/.test(variantId)) {
      return this.#report(this.dataset.errorUnavailable ?? "", true);
    }

    const originalLabel = submit?.textContent ?? "";
    if (submit) {
      submit.disabled = true;
      submit.textContent = this.dataset.labelPending ?? originalLabel;
    }

    try {
      const response = await fetch(
        `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${encodeURIComponent(publicKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/vnd.api+json",
            revision: KLAVIYO_REVISION,
          },
          body: JSON.stringify({
            data: {
              type: "back-in-stock-subscription",
              attributes: {
                channels: ["EMAIL"],
                profile: { data: { type: "profile", attributes: { email } } },
              },
              relationships: {
                variant: {
                  data: {
                    type: "catalog-variant",
                    // Klaviyo's id for a Shopify variant in its catalogue.
                    id: `$shopify:::$default:::${variantId}`,
                  },
                },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(`[klaviyo] back-in-stock rejected (${response.status}):`, detail);
        this.#report(this.dataset.errorFailed ?? "", true);
        return;
      }

      // Klaviyo can't say whether this address was already waiting, so the
      // message claims only what's true either way.
      this.#report(this.dataset.labelSuccess ?? "", false);
      input.value = "";
    } catch {
      this.#report(this.dataset.errorNetwork ?? "", true);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    }
  };

  /**
   * @param {string} text
   * @param {boolean} isError
   */
  #report(text, isError) {
    const { message, input } = this.refs;
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("back-in-stock__message--error", isError);
    if (isError) input?.setAttribute("aria-invalid", "true");
    else input?.removeAttribute("aria-invalid");
  }
}

customElements.define("back-in-stock", BackInStock);
