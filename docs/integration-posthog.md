# Integration: PostHog

Product analytics: one funnel, from product view to order, counted the same
way on all three surfaces. EU Cloud, autocapture, session replay and heatmaps
off (SHO-87).

## One vocabulary

Every event name and property shape lives in
`packages/analytics/src/product-analytics.ts`. A string-literal event name in
an app is a bug: two spellings of "add to cart" split one funnel into two.

| Event                   | Web | App | Theme (pixel) | Notes                                              |
| ----------------------- | --- | --- | ------------- | -------------------------------------------------- |
| `$pageview` / `$screen` | ✓   | ✓   | ✓             | The app sends `$screen`                            |
| `product_viewed`        | ✓   | ✓   | ✓             | `collections` on web and app only                  |
| `variant_selected`      | ✓   | ✓   | –             | Shopify has no pixel event for it                  |
| `selling_plan_selected` | ✓   | ✓   | –             | Shopify has no pixel event for it                  |
| `product_added_to_cart` | ✓   | ✓   | ✓             | Theme: `selling_plan` is always null               |
| `cart_viewed`           | ✓   | ✓   | ✓             |                                                    |
| `checkout_started`      | ✓   | ✓   | ✓             | The pixel sends it for theme carts only            |
| `order_completed`       | –   | –   | ✓             | **Every** surface's orders, from the pixel (below) |

Every event carries `surface` (`web`, `app` or `theme`), so one funnel can be
split by surface.

`quantity` on `product_added_to_cart` is what that add added. Adding a product
already in the cart grows its line in place, and the line's quantity would
count the earlier adds too.

## Transport

No PostHog SDK. Events go to PostHog's capture API with bare `fetch`, the same
code in the browser and in React Native. The SDK would cost web tens of kB for
features that are switched off.

## Consent

Nothing is sent without consent, and on all three surfaces the gate is the
same idea: no client until the shopper says yes.

| Surface | Choice                                                                                      |
| ------- | ------------------------------------------------------------------------------------------- |
| Web     | The cookie banner, shared with Klaviyo (ADR 0008). `analytics()` is null without `granted`. |
| App     | The in-app banner, shared with Klaviyo (`lib/tracking-consent.ts`).                         |
| Theme   | Shopify's own banner. The pixel is installed with Analytics required, so Shopify gates it.  |

Declining, or withdrawing later, deletes the anonymous id on web and in the
app.

## Orders: the custom pixel

Only Shopify's checkout knows an order was placed, and every surface hands off
to it. So orders are counted by a **Shopify custom pixel**,
`packages/analytics/pixel/posthog.js`, which runs on the theme's pages and in
every checkout. On the theme it also sends the funnel events, because the
Liquid theme has no PostHog code of its own.

### Crediting an order to the visit before it

Checkout runs on Shopify's domain, where neither web's localStorage nor the
app's keychain reaches. So when web or the app **creates** a cart, with
tracking consent, it adds two cart attributes:

| Attribute     | Value                    |
| ------------- | ------------------------ |
| `_posthog_id` | The shopper's PostHog id |
| `_surface`    | `web` or `app`           |

Checkout carries them to `checkout_completed`, and the pixel sends
`order_completed` under that id and surface. Untagged carts (the theme's, or
one created before the shopper accepted) are credited to Shopify's browser id
as `theme`.

- **Web** sends the id with the add-to-cart form (`AnalyticsIdField`), and the
  server re-checks the consent cookie before using it.
- **Only at creation.** A cart created before consent stays untagged.
- The attributes land on the order as note attributes, visible in the admin.
  The id is a random UUID, not personal data.

### Installing it (done in the Shopify admin, not by deploy)

1. **Settings → Customer events → Add custom pixel.** Name it "PostHog".
2. **Customer privacy:** Permission **Required**, tick **Analytics**. Data
   sale: **Data collected does not qualify as data sale**.
3. Paste the whole of `pixel/posthog.js`, and replace `__POSTHOG_KEY__` with
   the project's public key (the value of `NEXT_PUBLIC_POSTHOG_KEY`).
4. **Save**, then **Connect**.
5. Check in PostHog's activity feed: a theme product view with
   `surface: theme`, then a test order from web showing `order_completed` with
   `surface: web` under the same person as the web visit.

The pixel can't import `packages/analytics`, so it repeats the event names and
attribute keys. `src/pixel.test.ts` runs the file the way Shopify does and
fails if they drift. **Changing the pixel means pasting it into the admin
again.**

## Orders: the webhook (SHO-88)

The pixel can't count an order when it doesn't run: analytics declined again in
checkout, a blocker, a tab closed on the thank-you page. So the API Worker also
takes Shopify's **orders/create** webhook (`POST /webhooks/orders-create`,
`apps/api/src/order-webhook.ts`) and sends the same `order_completed`.

- **One event per order.** Pixel and webhook use the same event id,
  `orderEventUuid(order id)` in `packages/analytics`, which the pixel repeats
  (`pixel.test.ts` checks they agree). PostHog keeps one event per id, so the
  pair, Shopify's retries and replays all count once.
- **Only with consent.** It sends only when the order's cart carries
  `_posthog_id`, which web and the app add only for shoppers who allowed
  analytics.
- **Signed.** Nothing is read before the HMAC of the raw body checks out
  (`crypto.subtle.verify`). A failed PostHog call returns 502, so Shopify
  retries.
- **One difference:** the webhook payload doesn't say which lines are on a
  selling plan, so its event has no `has_subscription`. The pixel's has it.

**To switch it on** (store owner):

1. On the Worker: `wrangler secret put SHOPIFY_WEBHOOK_SECRET` (the client
   secret of the app that owns the webhook) and `wrangler secret put
POSTHOG_KEY` (the public project key). Until both are set it answers 503 and
   sends nothing.
2. Subscribe that app to **orders/create** at
   `https://<worker>/webhooks/orders-create`, JSON.
3. Place a test order from web with analytics accepted: one `order_completed`
   in PostHog, under the same person as the visit.

## Known gaps

- **Signed-in shoppers aren't identified.** `identify()` exists but nothing
  calls it yet: customer sign-in (#76 web, #78 app) isn't in this branch's
  base. It should be called at sign-in with the Shopify customer id.
- **Consent in checkout is Shopify's.** A web shopper who accepted on web but
  declines again in checkout sends no `order_completed` from the pixel. The
  webhook above fills that gap once it's switched on.
- **The theme can't report collections or selling plans** on its events:
  Shopify's pixel events don't carry them.

## Related

- [Klaviyo](integration-klaviyo.md) · [ADR 0008](adr/0008-headless-tracking-consent-is-our-own.md)
