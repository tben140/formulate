/**
 * The money-back guarantee, worded once for every surface: the product page
 * (beside the button), the cart and the checkout block.
 *
 * ⚠️ A promise, so it must match the store's refund policy
 * (Settings → Policies), which is what a shopper would hold us to. The
 * policy page is linked wherever the short line appears.
 */
export const GUARANTEE_DAYS = 30;

export const GUARANTEE_TITLE = `${GUARANTEE_DAYS}-day money-back guarantee`;

export const GUARANTEE_DETAIL = `Not right for you? Tell us within ${GUARANTEE_DAYS} days of delivery and we'll refund you in full.`;

/** Shopify's refund policy page, the same path on web and the theme. */
export const REFUND_POLICY_PATH = "/policies/refund-policy";
