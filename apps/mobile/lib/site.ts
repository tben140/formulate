/**
 * The public site's origin, for the product URLs in Klaviyo events: a flow
 * email links to whatever is in `URL`, and on a phone with the app installed
 * #254's app links open that product in the app.
 *
 * Fixed rather than configured: it is the brand's one public address, and it
 * must match `APP_LINK_HOST` in app.config.ts for the app links to apply.
 */
export const SITE_ORIGIN = "https://www.doublehelixsupplements.co.uk";
