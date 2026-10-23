/**
 * The email sign-up's offer, worded once for web and the app (the theme's
 * copy lives in its locale file, `newsletter.*`, and says the same).
 *
 * ⚠️ A promise, so it must match what Klaviyo actually sends: the
 * "Welcome v2" flow hands out a unique code from the WELCOME10 coupon, backed
 * by the Shopify discount "Welcome: 10% off a first one-time order". Only
 * show this copy while that flow is live.
 */
export const FIRST_ORDER_PERCENT = 10;

export const SIGN_UP_HEADING = `Get ${FIRST_ORDER_PERCENT}% off your first order`;

export const SIGN_UP_CONSENT = `Marketing emails: a ${FIRST_ORDER_PERCENT}% code for your first one-time order, then restock news and subscription offers. Unsubscribe any time.`;

export const SIGN_UP_SUCCESS = "You're on the list. Check your inbox for your code.";
