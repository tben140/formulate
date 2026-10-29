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

## Orders: the webhook as a backup (SHO-88)

The pixel can't count an order when it doesn't run: analytics declined again in
checkout, a blocker, a tab closed on the thank-you page. So the API Worker also
takes Shopify's **orders/create** webhook (`POST /webhooks/orders-create`,
`apps/api/src/order-webhook.ts`) and can send the same `order_completed`, but
only for orders the pixel missed.

**Why one sender per order.** PostHog merges duplicates only when the event id,
name, `distinct_id` _and_ `timestamp` all match, and only eventually. Both
senders use the same id (`orderEventUuid(order id)`, which the pixel repeats;
`pixel.test.ts` checks they agree), but the pixel can't know the order's
`created_at`, so its timestamp differs. Sending both would count the order
twice.

**How it decides** (`apps/api/src/order-backup.ts`): one Durable Object per
order.

1. After PostHog accepts the pixel's event, the pixel posts the order id to
   `POST /orders/counted` (plain text, no CORS preflight, rate-limited per
   IP). The order's object remembers it for three days, past Shopify's 48
   hours of retries.
2. The webhook stores its event in the same object and sets a ten-minute
   alarm. If the pixel has already reported, it stores nothing.
3. When the alarm fires, the event is sent only if the pixel still hasn't
   reported. A failed send throws, and Cloudflare retries the alarm with
   backoff. The object then empties itself.

So the pixel's richer event (`has_subscription`, the browser session) wins
whenever it ran, and the webhook covers the rest. Shopify's retries keep the
first stored event.

- **Only with consent.** The webhook acts only when the order's cart carries
  `_posthog_id`, which web and the app add only for shoppers who allowed
  analytics.
- **Signed.** Nothing is read before the HMAC of the raw body checks out
  (`crypto.subtle.verify`), and a body over 256 KB is refused before it's
  read. A consented order that arrives before `POSTHOG_KEY` is set gets 503,
  so Shopify retries it.
- **The "counted" note isn't signed.** The pixel can't hold a secret. Faking
  one only stops the backup for an order whose id the caller knows: a gap in
  analytics, never a wrong number.
- **Edge case:** a thank-you page that first loads more than ten minutes after
  the order (rare) can still count it twice.
- **The backup's event has no `has_subscription`:** the webhook payload
  doesn't say which lines are on a selling plan.

**To switch it on** (store owner), after the Worker is deployed with this code
(the deploy adds the OrderBackup object; no setup needed for it):

1. In Shopify admin, Settings → Notifications → Webhooks → **Create webhook**:
   Event "Order creation", format JSON, the newest API version, URL
   `https://<worker>/webhooks/orders-create`. The page shows the signing
   secret.
2. On the Worker: `wrangler secret put SHOPIFY_WEBHOOK_SECRET` (that signing
   secret) and `wrangler secret put POSTHOG_KEY` (the public project key).
   Until both are set it answers 503 and sends nothing.
3. In the custom pixel (Settings → Customer events), replace `__API_URL__`
   with `https://<worker>` and save. Until then the webhook's backup is sent
   for every order, so do this in the same sitting.
4. **Send test notification** from the webhook page (no `_posthog_id`, so 200
   and nothing sent), then place a test order from web with analytics
   accepted: one `order_completed` in PostHog, from the pixel, under the same
   person as the visit, and nothing more after ten minutes.

## Known gaps

- **Signed-in shoppers aren't identified.** `identify()` exists but nothing
  calls it yet: customer sign-in (#76 web, #78 app) isn't in this branch's
  base. It should be called at sign-in with the Shopify customer id.
- **Consent in checkout is Shopify's.** A web shopper who accepted on web but
  declines again in checkout sends no `order_completed` from the pixel. The
  webhook's backup fills that gap once it's switched on.
- **The theme can't report collections or selling plans** on its events:
  Shopify's pixel events don't carry them.

## Related

- [Klaviyo](integration-klaviyo.md) · [ADR 0008](adr/0008-headless-tracking-consent-is-our-own.md)
