import { Component } from "@theme/component";

/**
 * @typedef {Object} AccountDeletionRefs
 * @property {HTMLElement} [loading]
 * @property {HTMLElement} [preview]
 * @property {HTMLElement} [none]
 * @property {HTMLElement} [some]
 * @property {HTMLUListElement} [subscriptions]
 * @property {HTMLElement} [chargeToday]
 * @property {HTMLFormElement} [form]
 * @property {HTMLInputElement} [confirm]
 * @property {HTMLButtonElement} [submit]
 * @property {HTMLElement} [message]
 * @property {HTMLElement} [done]
 */

/**
 * @typedef {Object} PreviewSubscription
 * @property {string} title
 * @property {string | null} variant
 * @property {string | null} nextDelivery
 * @property {boolean} prepaid
 */

/** The Worker's failure reasons, to the data attribute holding each message. */
const ERRORS = /** @type {Record<string, string>} */ ({
  unauthorized: "errorUnauthorized",
  unavailable: "errorUnavailable",
  "not-configured": "errorNotConfigured",
  subscriptions: "errorSubscriptions",
  marketing: "errorPartial",
  erasure: "errorPartial",
  "rate-limited": "errorRateLimited",
});

/**
 * Delete your account (SHO-90), on the theme. Asks the Worker, through this
 * store's app proxy, what deleting would cancel, then deletes on a confirmed
 * submit. See sections/account-deletion.liquid and apps/api/src/app-proxy.ts.
 *
 * The preview answers with a short-lived confirmation token, sent back with
 * the deletion: the Worker refuses one without it, so another site can't make
 * a signed-in shopper's browser delete their account.
 *
 * @extends {Component<AccountDeletionRefs>}
 */
class AccountDeletion extends Component {
  /** @type {string | null} */
  #token = null;
  #sending = false;

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    // Rendered hidden: without this script there's nothing to press.
    this.hidden = false;
    this.refs.form?.addEventListener("submit", this.#onSubmit, { signal: this.signal });
    void this.#preview();
  }

  /**
   * @param {string} path
   * @param {object} body
   * @returns {Promise<any>}
   */
  async #post(path, body) {
    try {
      const response = await fetch(`${this.dataset.endpoint}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
        signal: this.signal,
      });
      if (response.status === 429) return { ok: false, reason: "rate-limited" };
      const json = await response.json().catch(() => null);
      return json && typeof json === "object" && "ok" in json
        ? json
        : { ok: false, reason: "network" };
    } catch {
      return { ok: false, reason: "network" };
    }
  }

  async #preview() {
    const result = await this.#post("/preview", {});
    if (this.refs.loading) this.refs.loading.hidden = true;
    if (!result.ok) {
      this.#fail(result.reason);
      return;
    }
    this.#token = result.confirmToken ?? null;
    /** @type {PreviewSubscription[]} */
    const subscriptions = result.subscriptions ?? [];
    const list = this.refs.subscriptions;
    if (list) {
      // textContent, never innerHTML: titles come from the store's data.
      list.replaceChildren(
        ...subscriptions.map((subscription) => {
          const item = document.createElement("li");
          const parts = [
            subscription.variant
              ? `${subscription.title} (${subscription.variant})`
              : subscription.title,
          ];
          if (subscription.nextDelivery) {
            parts.push(
              (this.dataset.nextDelivery ?? "").replace(
                "%DATE%",
                formatDate(subscription.nextDelivery),
              ),
            );
          }
          if (subscription.prepaid) parts.push(this.dataset.prepaid ?? "");
          item.textContent = parts.filter(Boolean).join(". ");
          return item;
        }),
      );
    }
    if (this.refs.none) this.refs.none.hidden = subscriptions.length > 0;
    if (this.refs.some) this.refs.some.hidden = subscriptions.length === 0;
    if (this.refs.chargeToday) this.refs.chargeToday.hidden = !result.chargeToday;
    if (this.refs.preview) this.refs.preview.hidden = false;
  }

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();
    if (this.#sending) return;
    if (!this.refs.confirm?.checked) {
      this.#say(this.dataset.confirmRequired ?? "");
      this.refs.confirm?.focus();
      return;
    }
    this.#sending = true;
    this.refs.submit?.setAttribute("aria-disabled", "true");
    this.#say(this.dataset.pending ?? "");

    const result = await this.#post("", { confirm: "delete", token: this.#token });
    this.#sending = false;
    this.refs.submit?.removeAttribute("aria-disabled");
    if (!result.ok) {
      this.#fail(result.reason);
      return;
    }
    if (this.refs.preview) this.refs.preview.hidden = true;
    this.#say("");
    if (this.refs.done) {
      this.refs.done.hidden = false;
      this.refs.done.focus();
    }
  };

  /** @param {string | undefined} reason */
  #fail(reason) {
    const key = (reason && ERRORS[reason]) || "errorGeneric";
    this.#say(this.dataset[key] ?? "");
  }

  /** @param {string} text */
  #say(text) {
    if (this.refs.message) this.refs.message.textContent = text;
  }
}

/** "2026-12-01" as "1 December 2026", the way web and the app show it. */
const formatDate = (/** @type {string} */ iso) => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      }).format(date);
};

if (!customElements.get("account-deletion")) {
  customElements.define("account-deletion", AccountDeletion);
}
