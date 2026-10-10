# Ad-platform tags

Seven ad platforms on the headless web shop, all behind the same tracking
consent as Klaviyo (ADR 0008):

- Google (GA4, optionally Google Ads);
- Meta;
- TikTok;
- Pinterest;
- Snapchat;
- Reddit;
- Microsoft Advertising.

Four of them also get a server-side copy of each event, through their
conversions APIs: Meta, TikTok, Pinterest and Snapchat. Each platform is off
until its id is set, so a deployment turns on only the ones it has accounts for.

## Who reports what

| Event          | Web (headless)                                 | Theme                  | Checkout (all surfaces) |
| -------------- | ---------------------------------------------- | ---------------------- | ----------------------- |
| Page view      | `components/ad-pixels.tsx`                     | Shopify's channel apps | Shopify's channel apps  |
| View item      | `track-viewed-product.tsx`                     | Shopify's channel apps | –                       |
| Add to cart    | `add-to-cart-form.tsx`, `cart-suggestions.tsx` | Shopify's channel apps | –                       |
| Begin checkout | `cart-drawer.tsx`                              | Shopify's channel apps | Shopify's channel apps  |
| Purchase       | –                                              | –                      | Shopify's channel apps  |

Every surface checks out on Shopify. So purchases, and everything on the
theme, are reported by each platform's own Shopify channel app, from checkout,
whichever surface the shopper came from:

- Google & YouTube;
- Facebook & Instagram;
- TikTok;
- Pinterest;
- Snapchat Ads;
- Reddit;
- Microsoft Channel.

Those apps' pixels don't run on the headless web pages, which is what this
code is for. The app sends nothing yet: the platforms' app SDKs need a native
build and Apple's tracking prompt.

## Events per platform

| Platform  | View item      | Add to cart   | Begin checkout     | Server-side copy |
| --------- | -------------- | ------------- | ------------------ | ---------------- |
| Google    | `view_item`    | `add_to_cart` | `begin_checkout`   | –                |
| Meta      | `ViewContent`  | `AddToCart`   | `InitiateCheckout` | Conversions API  |
| TikTok    | `ViewContent`  | `AddToCart`   | `InitiateCheckout` | Events API       |
| Pinterest | `pagevisit`    | `addtocart`   | – (see below)      | Conversions API  |
| Snapchat  | `VIEW_CONTENT` | `ADD_CART`    | `START_CHECKOUT`   | Conversions API  |
| Reddit    | `ViewContent`  | `AddToCart`   | – (see below)      | – (see below)    |
| Microsoft | `view_item`    | `add_to_cart` | `begin_checkout`   | – (see below)    |

- **No "begin checkout" for Pinterest or Reddit.** Neither has the event.
  Their nearest (Pinterest's `checkout`, Reddit's `Purchase`) means a
  completed order, which their channel apps already report. Sending it on the
  way into checkout would count every abandoned basket as a sale.
- **No server-side copy for Reddit or Microsoft yet.** Both have server APIs,
  but their public documentation wasn't enough to build payloads without
  guessing. They should be added once checked against a live account and the
  platform's own test tool.

## How the web side works

- **One event, every platform.** `packages/analytics/src/ad-events.ts` builds
  `view_item`, `add_to_cart` and `begin_checkout` once from storefront data.
  `ad-platforms.ts` (and the Google and Meta translators in `ad-events.ts`)
  turn them into each platform's names and fields. All of it is unit-tested.
- **Catalogue ids** match the ones Shopify's channel apps sync:
  `shopify_GB_<product>_<variant>`. A browser add-to-cart and the app's
  checkout purchase therefore refer to the same catalogue items.
- **One entry per platform** in `apps/web/lib/ad-pixels.ts`: its standard
  queue stub and script, its page view, and its event call. Adding a platform
  means adding an entry and a translator.
- **Consent first.**
  - Nothing loads or sends without the tracking-consent cookie, and the tags
    load once the page is idle.
  - Withdrawing consent deletes every platform's first-party cookies; the
    list is in `forgetAdCookies`.
  - The banner names exactly the platforms that are switched on.
  - Google's Consent Mode v2 and Microsoft's UET consent are set to granted,
    because the tags only exist after consent.
- **Deduplicated server-side copies.** Each event gets a UUID, which the
  browser tag sends as Meta's `eventID`, TikTok's `event_id`, Pinterest's
  `event_id`, Snapchat's `client_dedup_id` or Reddit's `conversionId`. The
  same event goes by `sendBeacon` to `app/api/ad-events`, which forwards it to
  each configured API with the same id, so each platform counts it once.
- **The server copy still counts** when an ad blocker or Safari's tracking
  protection stops the browser tag.
- **The route is public, like every pixel endpoint.** So:
  - it forwards nothing without the consent cookie;
  - the body is size-limited and rebuilt field by field (`parseAdEvent`);
  - user data is only what the browser already gave each platform: user
    agent, IP and the platform's own cookie (`_fbp`/`_fbc`, `_ttp`, `_epik`,
    `_scid`);
  - the caller always gets 204, and failures are logged as platform and
    status only.

## Performance cost

Measured 2026-10-10 on a product page, in Chromium with the CPU slowed 4×
(a mid-range phone). Consent was given, and dummy ids were set, so each
platform's real script downloaded. The figure is main-thread blocking time
(long tasks over 50 ms) in the 10–12 seconds after load, as the median of
three runs.

| Trackers loaded               | Blocking time | Tracker download |
| ----------------------------- | ------------- | ---------------- |
| None (no consent)             | ~0.5 s        | 0 KB             |
| Klaviyo only                  | ~0.6 s        | ~70 KB           |
| Klaviyo and all seven ad tags | ~1.9 s        | ~450 KB          |

Each ad platform alone, added to the page without trackers:

| Platform  | Extra blocking                                                                    |
| --------- | --------------------------------------------------------------------------------- |
| Meta      | ~690 ms                                                                           |
| Google    | ~610 ms                                                                           |
| Snapchat  | ~360 ms                                                                           |
| Reddit    | ~240 ms                                                                           |
| Pinterest | ~190 ms                                                                           |
| Microsoft | ~140 ms                                                                           |
| TikTok    | ~130 ms (with a dummy id, only its loader downloads, so likely higher in reality) |

What this means:

- **Loading time is unaffected.** The tags start after load, once the page
  is idle, so largest contentful paint doesn't move.
- **Lighthouse CI doesn't see it.** It audits without consent.
- **Shoppers who accept do pay it.** A tap during those seconds responds
  more slowly (INP), and it grows with each platform switched on.
- **So turn on only the platforms actually running ads.** Google and Meta
  are the v1 set. The rest are built and stay off until there's a campaign
  on them.
- **Options if more are needed:**
  - rely on the server-side copy alone for TikTok, Pinterest and Snapchat,
    which costs no browser time but gives the platform weaker matching;
  - move the tags into a web worker with Partytown. That would need a spike;
    see below.

### Partytown (researched 2026-10-10, not adopted)

[Partytown](https://partytown.qwik.dev) runs third-party scripts in a web
worker, so their work happens off the main thread. The page talks to them
through forwarded calls (`gtag`, `fbq`, `ttq.track` and so on). It could
remove most of the blocking measured above. What adopting it would involve:

- **Package and version.**
  - `@builder.io/partytown` is deprecated; the package is now
    `@qwik.dev/partytown`.
  - 1.0.0 was released on 2026-10-10, so under the repo's 14-day
    release-age rule it can be used from 2026-10-24. The newest version old
    enough today is 0.14.3 (2026-08-25).
  - The README still calls it beta.
- **No built-in Next.js support here.** `next/script`'s `strategy="worker"` is
  experimental and doesn't work with the App Router (Next.js docs). So
  integration would be manual:
  - serve Partytown's files from `public/~partytown`;
  - add its snippet to the root layout, with a `forward` list of every call
    we make;
  - inject each tag as `type="text/partytown"` after consent;
  - dispatch `ptupdate`.
- **CORS.** The worker fetches scripts with `fetch()`, which needs CORS
  headers that some vendors don't send.
  - Partytown's docs list Meta (`connect.facebook.net`) and Klaviyo as needing
    a reverse proxy.
  - Google and TikTok are listed as tested with no proxy.
  - Pinterest, Snapchat, Reddit and Microsoft aren't on its tested list at all.
  - A proxy route on our domain must allow only those exact script URLs, or
    it becomes an open proxy.
- **Service-worker mode, not Atomics.** Atomics mode needs cross-origin
  isolation headers (COOP/COEP), which would break cross-origin resources such
  as Shopify's CDN images and checkout.
- **Verification gets harder.** Tag Assistant and the pixel helper extensions
  are less reliable with scripts in a worker, so each platform's own test
  events would be the check.
- **Consent is unaffected.** Our tags only load after consent, so nothing
  else has to run on the main thread first.

Worth a spike only if more than Google and Meta need to be on at once. The
measure of success is the harness behind the table above: blocking time
with and without it, and each platform's test tool still receiving events.

## Setup (once per platform)

For every platform:

1. Create its pixel or tag in the platform's ads manager. All are free to
   create.
2. Install its Shopify channel app and connect the same pixel. That covers
   the theme and checkout.
3. Set its ids in Vercel. Tokens are secrets: set them as type **Sensitive**,
   and never put them in the repo, a PR or chat.

| Platform  | Public id(s)                                              | Secret token           | Shopify app          |
| --------- | --------------------------------------------------------- | ---------------------- | -------------------- |
| Google    | `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`         | –                      | Google & YouTube     |
| Meta      | `NEXT_PUBLIC_META_PIXEL_ID`                               | `META_CAPI_TOKEN`      | Facebook & Instagram |
| TikTok    | `NEXT_PUBLIC_TIKTOK_PIXEL_ID`                             | `TIKTOK_EVENTS_TOKEN`  | TikTok               |
| Pinterest | `NEXT_PUBLIC_PINTEREST_TAG_ID`, `PINTEREST_AD_ACCOUNT_ID` | `PINTEREST_CAPI_TOKEN` | Pinterest            |
| Snapchat  | `NEXT_PUBLIC_SNAP_PIXEL_ID`                               | `SNAP_CAPI_TOKEN`      | Snapchat Ads         |
| Reddit    | `NEXT_PUBLIC_REDDIT_PIXEL_ID`                             | –                      | Reddit               |
| Microsoft | `NEXT_PUBLIC_UET_TAG_ID`                                  | –                      | Microsoft Channel    |

`.env.example` says where each id and token lives in its platform's UI.

**Verify** each one before relying on it. The server payloads follow each
platform's documentation, but they've only been checked against the real
endpoints with dummy tokens, which every platform rejected at
authentication.

| Platform  | How to verify                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google    | Tag Assistant (tagassistant.google.com) and GA4's DebugView                                                                                                                                                 |
| Meta      | Set `META_TEST_EVENT_CODE`; browser and server events appear in Events Manager → Test events, marked deduplicated. Meta can't verify `*.vercel.app`, so domain verification waits for the shop's own domain |
| TikTok    | Set `TIKTOK_TEST_EVENT_CODE`; events appear in Events Manager → Test events                                                                                                                                 |
| Pinterest | Set `PINTEREST_TEST_MODE=true`; server events go to Pinterest's sandbox and are validated, never reported                                                                                                   |
| Snapchat  | The Snap Pixel Helper extension for the browser; Events Manager for the server copies                                                                                                                       |
| Reddit    | The Reddit Pixel Helper extension                                                                                                                                                                           |
| Microsoft | The UET Tag Helper extension                                                                                                                                                                                |

Unset the test settings afterwards.

## Checked

- **Unit tests** (`ad-events.test.ts`, `ad-platforms.test.ts`):
  - each platform's event names and fields;
  - Pinterest and Reddit send nothing for begin checkout;
  - the browser and server copies share the event and its id;
  - each server copy carries the platform's own cookie and no other
    personal data;
  - the validator rejects anything off-shape.
- **In Chromium** against a production build with dummy ids for all seven
  (every platform's script intercepted):
  - nothing loads before consent;
  - Accept loads all seven, and each queues its own page view;
  - an add to cart reaches all seven in each platform's own format;
  - one beacon goes to the server route;
  - the route forwarded to Meta, TikTok, Pinterest and Snapchat, each
    rejecting the dummy token with a 401;
  - Decline deletes every platform's cookies and leaves others alone.
