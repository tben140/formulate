/**
 * The AJAX Cart API, wrapped.
 *
 * This surface does NOT use packages/shopify. The Online Store already owns
 * cart state in its own cookie, so the Storefront Cart API would mean running a
 * second, parallel cart alongside the one Shopify is already keeping — with two
 * sets of ids and no way to reconcile them at checkout.
 *
 * See docs/adr/0005-parity-means-design-not-data.md: parity is the design
 * system, not the data layer.
 *
 * Every call asks for `sections` and gets rendered Liquid back. That is what
 * keeps the drawer's markup in `sections/cart-drawer.liquid` rather than
 * duplicated as template strings here — the same reason the rest of the theme
 * has no client-side rendering.
 *
 * @typedef {Object} CartResponse
 * @property {Record<string, string>} [sections] Rendered section HTML by id.
 * @property {string} [description] Shopify's error message, when it errors.
 * @property {number} [status] Present only on errors.
 */

/** Sections re-rendered after every mutation. */
const SECTIONS = "cart-drawer";

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @returns {Promise<CartResponse>}
 * @throws {Error} When Shopify refuses the change — sold out, quantity rules.
 */
const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ...body, sections: SECTIONS }),
  });

  /** @type {CartResponse} */
  const data = await response.json();

  if (!response.ok) {
    /*
     * Shopify puts the human-readable reason in `description` and a repeat of
     * the HTTP status in `message`. `description` is the one worth showing a
     * shopper: "All 3 Ski Wax are in your cart." rather than "422".
     */
    throw new Error(data.description || "Could not update your cart.");
  }

  return data;
};

/**
 * @param {string} variantId
 * @param {number} quantity
 * @param {string} [sellingPlanId] Omit or pass empty for a one-time purchase.
 * @returns {Promise<CartResponse>}
 */
export const addItem = (variantId, quantity, sellingPlanId) =>
  post("/cart/add.js", {
    items: [
      {
        id: variantId,
        quantity,
        // Shopify rejects `selling_plan: ""`, so the key is omitted entirely
        // rather than sent empty.
        ...(sellingPlanId ? { selling_plan: sellingPlanId } : {}),
      },
    ],
  });

/**
 * Changes a line's quantity. Zero removes it, so there is no separate remove
 * call to keep in step.
 *
 * @param {string} lineKey Shopify's line key, not the variant id — the same
 *   variant can appear twice with different selling plans.
 * @param {number} quantity
 * @returns {Promise<CartResponse>}
 */
export const changeItem = (lineKey, quantity) =>
  post("/cart/change.js", { id: lineKey, quantity });
