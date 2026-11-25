import { Component } from "@theme/component";

/**
 * @typedef {Object} ShareButtonRefs
 * @property {HTMLButtonElement} [button]
 * @property {HTMLElement} [label]
 */

/**
 * Share this page, the counterpart of apps/web's components/share-button.tsx
 * and the app's header button. The system share sheet where the browser has
 * one; otherwise the link is copied.
 *
 * Rendered `hidden` and revealed here: without JavaScript it would be a
 * button that does nothing.
 *
 * @extends {Component<ShareButtonRefs>}
 */
class ShareButton extends Component {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #reset;

  /** @override */
  connectedCallback() {
    super.connectedCallback();
    this.hidden = false;
    this.refs.button?.addEventListener("click", () => void this.#share(), {
      signal: this.signal,
    });
  }

  /** @override */
  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this.#reset);
  }

  async #share() {
    const url = this.dataset.url ?? window.location.href;
    const title = this.dataset.title ?? document.title;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // A cancelled sheet rejects with AbortError: nothing to say about it.
        // Anything else (NotAllowedError under a permissions policy) falls
        // through to copying the link, so the button still does something.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    const label = this.refs.label;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard either: the address bar has the link.
      return;
    }
    if (!label) return;
    const original = this.dataset.shareLabel ?? label.textContent;
    label.textContent = this.dataset.copiedLabel ?? "Link copied";
    clearTimeout(this.#reset);
    this.#reset = setTimeout(() => {
      label.textContent = original;
    }, 2000);
  }
}

if (!customElements.get("share-button")) {
  customElements.define("share-button", ShareButton);
}
