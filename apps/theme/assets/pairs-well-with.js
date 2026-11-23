/**
 * Fills <pairs-well-with> with Shopify's complementary-product
 * recommendations (SHO-153). See sections/pairs-well-with.liquid for why this
 * takes a second request.
 *
 * The response is parsed with DOMParser and adopted as nodes, as
 * cart-drawer.js does: the inert document never runs scripts. If the request
 * fails or finds nothing, the element simply stays empty.
 */
class PairsWellWith extends HTMLElement {
  connectedCallback() {
    const url = this.dataset.url;
    if (!url || this.childElementCount > 0) return;
    void this.#load(url);
  }

  /** @param {string} url */
  async #load(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
      const content = parsed.querySelector("pairs-well-with .pairs-well-with");
      if (content) this.replaceChildren(document.importNode(content, true));
    } catch {
      // A suggestion that can't load just isn't shown.
    }
  }
}

if (!customElements.get("pairs-well-with")) {
  customElements.define("pairs-well-with", PairsWellWith);
}
