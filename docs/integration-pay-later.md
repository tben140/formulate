# Pay later: Klarna and Clearpay

**Status:** the storefront side is ready (icons on all three surfaces, behind
one switch). Neither provider is set up on the store yet; that's done in
Shopify admin, by the store owner.

## How it fits together

Paying happens in Shopify's checkout on every surface: the theme's, web's
redirect and the app's Checkout Sheet Kit all open the same checkout. So once a
provider is active in admin, it appears there with no code change. What the
storefronts add is the footer's payment icons.

The footer icons come from what Shopify reports the store accepts. For cards
and wallets that works everywhere: the theme reads `shop.enabled_payment_types`
and web and the app read the Storefront API's `shop.paymentSettings`. **The
Storefront API doesn't report pay-later providers**: `paymentSettings` lists
card brands and digital wallets only. So Klarna and Clearpay are switched on
by a shop metafield that all three surfaces read, and show only when it lists
them:

| Metafield                | Type                     | Values               |
| ------------------------ | ------------------------ | -------------------- |
| `double_helix.pay_later` | List of single line text | `klarna`, `clearpay` |

The theme ignores `enabled_payment_types` for these two, so the three surfaces
can't disagree. Code: `packages/shopify/src/payment-icons.ts` (web and the
app), `apps/theme/snippets/payment-icons.liquid`, and the icons in
`packages/tokens/src/payment.ts` (Shopify's own icon set).

## Setting a provider up

1. **Klarna** comes through Shopify Payments, which has to be set up first
   (Settings → Payments). Shopify's help centre lists the UK among the
   countries where Klarna shows at checkout. On a development store this can
   only run in test mode.
2. **Clearpay** is a separate payment provider with its own merchant account,
   added under Settings → Payments → Add payment methods. Whether it can be
   connected to a development store is unconfirmed: ask Clearpay first.
3. Place a test order with each from the theme, web and the app.
4. Then switch the icons on. Once only: create the metafield definition
   (Settings → Custom data → Shop → Add definition: namespace and key
   `double_helix.pay_later`, type "Single line text", list of values,
   **Storefronts access on**, or web and the app can't read it). Then set its
   value on the shop to `klarna`, `clearpay` or both.

The icons change on the theme at once and on web within the page cache's
lifetime. In the app, the payment settings are cached for an hour, then
fetched again the next time a screen with the footer opens; a screen left open
keeps what it has.

## Not built yet: "pay in 3" messages

Both providers offer on-site messages ("3 interest-free payments of £x") for
product and cart pages. They're left out on purpose:

- **They need the live accounts:** a Klarna client ID and a Clearpay merchant
  ID.
- **They're financial promotions.** Buy-now-pay-later lending is regulated by
  the FCA in the UK since 15 July 2026. The providers' own widgets carry their
  approved wording; text of our own would need checking first.
- **Web and the app would need the providers' scripts or SDKs**, which the
  theme's app embeds don't cover, and the CSP (#160) would need their domains.

Revisit once a provider is live and the wording question is answered.
