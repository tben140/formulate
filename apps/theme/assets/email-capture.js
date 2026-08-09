import { Component } from "@theme/component";

/**
 * @typedef {Object} EmailCaptureRefs
 * @property {HTMLInputElement} [input]
 * @property {HTMLButtonElement} [submit]
 * @property {HTMLElement} [message]
 */

/**
 * Klaviyo's API version, pinned.
 *
 * ⚠️ Duplicated from `packages/analytics/src/subscribe.ts`, and it has to be.
 * The theme ships plain ES modules with no build step, so it cannot import a
 * TypeScript workspace package — the same boundary that gives the cart two
 * implementations. Change one, change the other.
 */
const KLAVIYO_REVISION = "2026-07-15";

/**
 * ⚠️ Klaviyo silently discards addresses it judges fake — anything on
 * example.com or test.com, or containing test/fake/invalid — and returns 202
 * regardless. Warn rather than block: we cannot reproduce their filter well
 * enough to reject a real shopper over it.
 *
 * @param {string} email
 * @returns {boolean}
 */
const looksFakeToKlaviyo = (email) =>
  /@(example|test|invalid|localhost)\.|[._-]?(test|fake|invalid|dummy)[._-]?/i.test(
    email.toLowerCase(),
  );

/**
 * @param {string} value
 * @returns {boolean}
 */
const isPlausibleEmail = (value) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim());

/**
 * Newsletter sign-up, and the theme's identity moment.
 *
 * ⚠️ The theme needs this **as much as the headless surfaces do**, which is
 * easy to miss. Klaviyo's app embed emits `Viewed Product` here automatically
 * with no code from us — but it caches those events for an anonymous visitor
 * and transmits nothing. The automatic tracking is only as useful as the
 * identification that unlocks it, and the embed provides no way to identify.
 *
 * Two steps: subscribe (durable, creates the profile and records consent),
 * then `_learnq.push(["identify"])` (tells the script running in this tab who
 * the visitor is, which flushes everything it has cached).
 *
 * @extends {Component<EmailCaptureRefs>}
 */
class EmailCapture extends Component {
  /** @override */
  connectedCallback() {
    super.connectedCallback();

    this.addEventListener("submit", this.#onSubmit, { signal: this.signal });
    this.addEventListener("input", this.#onInput, { signal: this.signal });
  }

  /** @returns {string} */
  get #publicKey() {
    return this.dataset.publicKey ?? "";
  }

  /** @returns {string} */
  get #listId() {
    return this.dataset.listId ?? "";
  }

  /**
   * Clears a stale message as soon as the shopper starts correcting it —
   * otherwise the error contradicts what is now in the field.
   */
  #onInput = () => {
    const { input, message } = this.refs;
    if (!message || !message.textContent) return;

    message.textContent = "";
    message.classList.remove("email-capture__message--error");
    input?.removeAttribute("aria-invalid");
  };

  /** @param {Event} event */
  #onSubmit = async (event) => {
    event.preventDefault();

    const { input, submit } = this.refs;
    if (!input) return;

    const email = input.value.trim();

    /*
     * Empty is separated from malformed because the form sets `novalidate`.
     * Native validation fires before this handler and reports through a
     * browser bubble screen readers announce inconsistently, so the messaging
     * is ours — including the empty case the browser used to cover.
     */
    if (email === "") {
      this.#report(this.dataset.errorEmpty ?? "", true);
      return;
    }

    if (!isPlausibleEmail(email)) {
      this.#report(this.dataset.errorInvalid ?? "", true);
      return;
    }

    if (looksFakeToKlaviyo(email)) {
      console.warn(
        `[klaviyo] "${email}" looks like test data. Klaviyo silently discards ` +
          `addresses containing test/fake/invalid or on example.com and test.com, ` +
          `and still returns 202. Use a plausible address, or nothing will appear ` +
          `in the dashboard. See docs/integration-klaviyo.md.`,
      );
    }

    if (!this.#publicKey || !this.#listId) {
      // Not the shopper's problem, so do not blame their address.
      this.#report(this.dataset.errorUnavailable ?? "", true);
      return;
    }

    const originalLabel = submit?.textContent ?? "";
    if (submit) {
      submit.disabled = true;
      submit.textContent = this.dataset.labelPending ?? originalLabel;
    }

    try {
      const response = await fetch(
        `https://a.klaviyo.com/client/subscriptions/?company_id=${encodeURIComponent(this.#publicKey)}`,
        {
          method: "POST",
          headers: {
            // Klaviyo rejects application/json here — JSON:API requires its
            // own media type and this endpoint enforces it.
            "Content-Type": "application/vnd.api+json",
            revision: KLAVIYO_REVISION,
          },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                custom_source: "Formulate theme",
                profile: {
                  data: {
                    type: "profile",
                    attributes: {
                      email,
                      subscriptions: {
                        email: { marketing: { consent: "SUBSCRIBED" } },
                      },
                    },
                  },
                },
              },
              relationships: {
                list: { data: { type: "list", id: this.#listId } },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        /*
         * Klaviyo's own words, in the console. The shopper gets something
         * human; whoever is configuring this needs the actual cause, and this
         * is the one endpoint in the integration that gives one. A wrong list
         * id says exactly that: {"detail":"List not found"}.
         */
        const detail = await response.text().catch(() => "");
        console.error(`[klaviyo] subscription rejected (${response.status}):`, detail);

        this.#report(this.dataset.errorFailed ?? "", true);
        return;
      }

      /*
       * The step that makes the rest of the integration work.
       *
       * Without it the profile exists in Klaviyo but this browser is still
       * anonymous, so the `Viewed Product` events the app embed has been
       * caching all session stay cached.
       *
       * `_learnq`, never `window.klaviyo` — the latter is owned by klaviyo.js
       * and pushing to it does nothing at all, silently.
       */
      window._learnq = window._learnq || [];
      window._learnq.push(["identify", { $email: email }]);

      // "You're on the list", not "Thanks for subscribing": Klaviyo returns
      // 202 whether the profile is new or already subscribed, and gives us no
      // way to tell. The wording has to be true under both.
      this.#report(this.dataset.labelSuccess ?? "", false);
      input.value = "";
    } catch {
      // Offline, blocked, or an http:// page — where Klaviyo's own URLs are
      // derived from the page protocol and never complete.
      this.#report(this.dataset.errorNetwork ?? "", true);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    }
  };

  /**
   * Writes to the live region, which also describes the input — so the message
   * is announced when it appears and reachable from the field afterwards.
   *
   * @param {string} text
   * @param {boolean} isError
   */
  #report(text, isError) {
    const { message, input } = this.refs;
    if (!message) return;

    message.textContent = text;
    message.classList.toggle("email-capture__message--error", isError);

    if (isError) input?.setAttribute("aria-invalid", "true");
    else input?.removeAttribute("aria-invalid");
  }
}

customElements.define("email-capture", EmailCapture);
