# ADR 0008 — Headless tracking consent is our own banner, not Shopify's API

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

The three surfaces disagreed about tracking consent ([SHO-121]). On the Liquid
theme, Klaviyo's app embed defers to Shopify's Customer Privacy API: a shopper
who declines gets no `__kla_id` cookie and sends no events. `apps/web` loaded
`klaviyo.js` for every visitor and sent `Viewed Product` and `Added to Cart`
without asking. That was measured on 2026-09-21, same store, minutes apart.

Two things were wrong with that. Klaviyo's cookie and behavioural events are not
strictly necessary, so under PECR they need consent first. And any comparison of
flow volume between the surfaces was really comparing consent rates, because
only the theme's decliners were invisible.

The issue assumed Shopify's Customer Privacy API is unavailable off
Shopify-hosted pages. **That is out of date.** Hydrogen's `useCustomerPrivacy`
loads the same `consent-tracking-api.js` (or Shopify's own banner,
`storefront-banner.js`) on a headless storefront, and wraps
`setTrackingConsent` to add `headlessStorefront: true`, the checkout domain and
a Storefront access token. So the option was real and had to be weighed.

## Decision

`apps/web` has its own tracking-consent banner, backed by one first-party
cookie, `formulate_tracking_consent`, holding `granted` or `denied`.

- **The gate is `klaviyo.js` not loading.** The root layout reads the cookie on
  the server; the script is rendered only when it says `granted`. Without the
  script `_learnq` is a plain array that nothing reads or transmits.
- **Opt-in.** No cookie means no tracking, and the banner is shown.
- **Events before a decision wait in memory**, exactly as on the theme. Accepting
  mounts the script, which drains them; declining discards them, and `track` and
  `identify` drop everything afterwards.
- **Accept and Decline carry equal weight** and neither blocks the page.
- **Withdrawal is one click away for the whole visit**, from "Cookie
  preferences" in the footer. Withdrawing after accepting deletes what
  `klaviyo.js` stored (the `__kla_id` cookie, four `localStorage` keys, one
  `sessionStorage` key) and reloads into a page rendered without the script.
- **The choice lasts six months**, then the banner asks again.

### What deliberately does not need consent

| Thing                               | Why not                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `formulate_tracking_consent`        | Records the choice itself, refusal included. Strictly necessary.                                                                  |
| The cart cookie                     | Holds the cart the shopper built. Strictly necessary for the service asked for.                                                   |
| Vercel Analytics and Speed Insights | Cookieless, no personal data, nothing stored on the device.                                                                       |
| The email capture form              | Records **marketing** consent explicitly, through Klaviyo's subscriptions endpoint. A different consent with its own legal basis. |

⚠️ **Signing up for emails does not grant tracking consent.** Agreeing to be
emailed is not agreeing to have your browsing recorded, and PECR treats them
separately. So a subscriber who declined tracking gets the emails and no
browse or cart-abandonment flows. Correct, if less convenient for the flows.

### Mobile

Mobile has **no behavioural tracking to gate today**. It initialises the Klaviyo
SDK and calls `setEmail` only after an explicit newsletter sign-up
([ADR 0007](0007-mobile-consent-goes-through-a-worker.md)). Our code emits no
`Viewed Product` or cart events, and there are no web cookies to set. What the
SDK does on its own after `initialize` has not been audited, which is one more
reason the next point matters.

When [SHO-109] adds events, they must go behind the same three-state choice,
stored on the device and asked in-app. PECR's "storage and access" rule covers
app storage as well as cookies. The same rule means `Klaviyo.initialize` should
move behind consent at that point, not stay at app start.

## Alternatives considered

**Shopify's Customer Privacy API, headless mode.** The strongest option on
paper: one consent record shared with Shopify checkout, and the same mechanism
as the theme. It lost on three counts:

1. **It needs the Storefront token in the browser.** The API calls the
   Storefront API from the client. `apps/web/AGENTS.md` forbids exposing
   `SHOPIFY_STOREFRONT_TOKEN`, and everything in this app is built to keep it
   server-side. Hydrogen's way round this is a same-origin Storefront API
   proxy, which is a bigger change than this issue.
2. **The checkout link does not work from `*.vercel.app`.** Consent is shared
   through cookies on a common parent domain (Hydrogen derives
   `storefrontRootDomain` from the overlap between the storefront host and the
   checkout domain). A Vercel preview and `myshopify.com` share no parent, so
   the main benefit only appears once there is a real custom domain.
3. **It is implemented by intercepting globals.** Hydrogen redefines
   `window.Shopify` and `window.privacyBanner` with property setters to wrap the
   scripts as they load. Doing that by hand, outside Hydrogen, would depend on
   internals Shopify does not document.

**A third-party consent platform** (Cookiebot, OneTrust and similar). Paid
beyond a free tier, another script in the page, and far more than one vendor
behind one yes-or-no needs. It also breaks the free-tier-only budget.

**Gating inside `track` only, still loading the script.** Rejected immediately:
`klaviyo.js` sets `__kla_id` and fetches from Klaviyo the moment it loads,
before any event. Filtering events would leave the cookie, which is the part
PECR is actually about.

## Consequences

- **Consent is not shared with Shopify checkout.** Checkout is on Shopify's
  domain and applies its own privacy settings. A shopper may be asked twice.
  That is also how the web and checkout domains relate today.
- **The theme and web banners look different.** The theme shows Shopify's
  banner, this surface shows ours. Behaviour matches (opt-in, equal choices,
  nothing tracked until yes); appearance is not the point of
  [ADR 0005](0005-parity-means-design-not-data.md) here. Shopify's banner is
  styled from the Shopify admin, not from our tokens.
- **Withdrawing reloads the page.** There is no API to unload `klaviyo.js`.
- **Decliners are now invisible on web, as on the theme.** That is what makes
  flow volume comparable across surfaces again. Expect web numbers to drop by
  roughly the decline rate.
- **`forgetKlaviyo` lists the keys Klaviyo was observed to write.** If a future
  `klaviyo.js` adds more, withdrawal will leave them behind silently. Recheck
  after a Klaviyo change: accept, then withdraw, then list storage.

## Revisit when

- The store moves to a real custom domain sharing a parent with checkout, and
  the Storefront API is proxied same-origin. Both of Shopify's API's blockers
  are then gone, and one consent record across storefront and checkout becomes
  worth having.
- A second tracking vendor needs gating. Then the choice needs categories
  (analytics, marketing), not one yes or no.
- [SHO-109] adds mobile events, per the mobile section above.

[SHO-121]: https://linear.app/shopify-project/issue/SHO-121
[SHO-109]: https://linear.app/shopify-project/issue/SHO-109
