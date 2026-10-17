# Google and Meta ad tags

Google Analytics 4 (optionally Google Ads) and the Meta Pixel, with Meta's
Conversions API server-side. All of it sits behind the same tracking consent
as Klaviyo (ADR 0008).

## Who reports what

| Event          | Web (headless)                                 | Theme                  | Checkout (all surfaces) |
| -------------- | ---------------------------------------------- | ---------------------- | ----------------------- |
| Page view      | `components/ad-pixels.tsx`                     | Shopify's channel apps | Shopify's channel apps  |
| View item      | `track-viewed-product.tsx`                     | Shopify's channel apps | –                       |
| Add to cart    | `add-to-cart-form.tsx`, `cart-suggestions.tsx` | Shopify's channel apps | –                       |
| Begin checkout | `cart-drawer.tsx`                              | Shopify's channel apps | Shopify's channel apps  |
| Purchase       | –                                              | –                      | Shopify's channel apps  |

Every surface checks out on Shopify, so purchases are reported by Shopify's
own **Google & YouTube** and **Facebook & Instagram** apps, from checkout,
whichever surface the shopper came from. Their app pixels also cover the
theme. They don't run on the headless web pages, which is what this code is
for. The app sends nothing yet: Meta's and Google's app SDKs need a native
build and Apple's tracking prompt.

## How the web side works

- **One event, two platforms.** `packages/analytics/src/ad-events.ts` builds
  `view_item`, `add_to_cart` and `begin_checkout` once from storefront data.
  It then translates them: GA4's recommended ecommerce events, and Meta's
  `ViewContent`, `AddToCart` and `InitiateCheckout`.
- **Catalogue ids** match the ones Shopify's channel apps sync:
  `shopify_GB_<product>_<variant>`. A browser add-to-cart and the app's
  checkout purchase therefore refer to the same catalogue items.
- **Consent first.** Nothing loads or sends without the tracking-consent
  cookie. The tags load once the page is idle. Withdrawing consent deletes
  `_ga*`, `_gid`, `_gcl_*`, `_fbp` and `_fbc`. Consent Mode v2 signals are set
  to granted, because the tags only exist after consent.
- **Deduplicated server-side copy.** Each event gets a UUID. The Pixel sends
  it as `eventID`. The same event goes by `sendBeacon` to `app/api/ad-events`,
  which forwards it to the Conversions API with the same `event_id`, so Meta
  counts it once.
- **The server copy still counts** when an ad blocker or Safari's tracking
  protection stops the Pixel.
- **The route is public, like every pixel endpoint.** So:
  - it forwards nothing without the consent cookie;
  - the body is size-limited and rebuilt field by field (`parseAdEvent`);
  - `user_data` is only what the browser already gave Meta: user agent, IP
    and Meta's own cookies;
  - the caller always gets 204.

## Setup (once)

**Google**

1. In Google Analytics, create a property and a **Web** data stream for the
   production URL. Copy the measurement id (`G-…`).
2. In the Shopify admin, install **Google & YouTube**, connect the same Google
   account, and choose the same GA4 property. This covers the theme and
   checkout.
3. Optional: in Google Ads, create a conversion and copy its id (`AW-…`).
4. In Vercel, set `NEXT_PUBLIC_GA4_ID` (and `NEXT_PUBLIC_GOOGLE_ADS_ID`).

**Meta**

1. In Meta Business Suite → Events Manager → Connect data → Web, create a
   dataset (pixel). Copy its id.
2. In the Shopify admin, install **Facebook & Instagram**, connect the same
   business and dataset, and set data sharing to **Maximum**. That turns on
   Shopify's own Conversions API for the theme and checkout.
3. In Events Manager → the dataset → Settings → Conversions API, generate an
   access token.
4. In Vercel:
   - set `NEXT_PUBLIC_META_PIXEL_ID`;
   - set `META_CAPI_TOKEN`, as type **Sensitive**. It's a secret: it never
     goes in the repo, a PR or chat.

**Verify**

- **Google:** Tag Assistant (tagassistant.google.com) on the preview or
  production URL, and GA4's DebugView.
- **Meta:** set `META_TEST_EVENT_CODE` from Events Manager → Test events.
  Browser and server events then both appear there, marked deduplicated.
  Unset it afterwards.
- **Domain verification:** Meta can't verify `*.vercel.app`, because it's a
  shared domain. It becomes possible once the shop has its own domain.

## Checked

- **Unit tests** (`ad-events.test.ts`):
  - payload shapes and catalogue ids;
  - the Pixel and the Conversions API get the same name, data and id;
  - no extra personal data is sent;
  - the validator rejects anything off-shape.
- **In Chromium** against a production build with dummy ids (Google's and
  Meta's scripts intercepted):
  - nothing loads before consent;
  - Accept loads both and sends page views;
  - a product view and an add to cart reach both platforms, and the beacon
    carries the Pixel's `eventID`;
  - the route forwarded to Meta (a 401 with the dummy token);
  - Decline deletes the cookies.
