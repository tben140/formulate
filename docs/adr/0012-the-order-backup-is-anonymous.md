# ADR 0012 — The order webhook's backup is anonymous, and its "counted" route allows any origin

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

SHO-88 counts orders the checkout pixel misses. The pixel sends
`order_completed` from the shopper's browser, under Shopify's analytics
consent, credited to their visit through the cart's `_posthog_id`. It misses
an order when it doesn't run. The API Worker takes Shopify's orders/create
webhook, holds a backup event for ten minutes, and sends it only if the pixel
hasn't reported the order (`apps/api/src/order-backup.ts`).

The first version sent the backup under the cart's `_posthog_id`, taking that
attribute as proof of consent. Review found the hole: a shopper can allow
analytics on web, then decline it in Shopify's checkout. The pixel respects
that and stays quiet, and the backup then sent the order under their id
anyway. Shopify's order payload doesn't carry the checkout's consent choice,
so the webhook can't tell "declined in checkout" from "tab closed" or "a
blocker stopped the pixel". No change on our side of the cart can fix that.

The pixel also has to tell the Worker "this order was counted". It runs in
Shopify's sandbox, on an origin we don't control, and needs to read the
response status to know whether to retry. The Worker's rule is no CORS
headers at all (ADR 0007, `apps/api/AGENTS.md`).

## Decision

**The backup event is anonymous, for every order.**

- No visitor id and no order id. Its `uuid` and `distinct_id` are one id: an
  HMAC of the order id under the webhook secret, formatted as a UUID. It's
  stable, so Shopify's retries and our resends merge in PostHog, and it can't
  be recomputed from an order id without the secret.
- `$process_person_profile: false`, so PostHog creates no person, and
  `$geoip_disable: true`. The sender is the Worker, so no shopper IP or device
  details are involved.
- It carries the order's value, item count, currency, surface (`_surface`,
  which isn't personal), Shopify's `source_name`, and time.
- It no longer depends on `_posthog_id`, so every order is covered, theme and
  admin orders included.

Who bought what stays with the pixel, under the consent the shopper gave in
checkout. The web and app clean-up that takes `_posthog_id` off a cart after a
refusal stays, as housekeeping, not as the consent control.

**`POST /orders/counted` answers with `access-control-allow-origin: *`**, the
one exception to the Worker's no-CORS rule. It's safe because:

- the route can only cancel a backup, never send anything;
- it acts only when the note's checkout token matches the webhook's
  `checkout_token`. Order ids are close to sequential; the token is a long
  random string, known to the buyer's browser, Shopify, and apps that can
  read orders. Anyone holding it can, at worst, stop one anonymous backup
  event for an order the pixel didn't count;
- a status code is all any site can read from it;
- it's rate-limited per IP like the subscribe endpoint;
- what a note stores is bounded: only the first note for an order sets its
  three-day timer, so repeated notes, right or wrong, can't keep state longer.

**The same route takes an order id from the request**, which the Worker's
review rules flag (`apps/api/**` in `.coderabbit.yaml`: record ids come from
Shopify's answer, not the caller). Here the id only picks which order's
object to check. It reads nothing back and changes nothing without the
matching token, so it's a second, recorded exception.

## Alternatives considered

**Keep the backup under the shopper's id.** Rejected: it sends a purchase
linked to a person who declined analytics in checkout.

**Back up only orders with no checkout**, such as admin orders, where no
consent question arises. Rejected: almost no value. The orders the pixel
misses are checkout orders.

**Drop the backup.** Rejected: revenue and order counts in PostHog would be
short by every order whose pixel didn't run, with no way to tell how many.

**Make the pixel's note a preflighted JSON request with an allowlisted
origin.** The sandbox's origin isn't ours to name, and a `null` or wildcard
allowlist is the same exception with more moving parts.

## Consequences

- **Two kinds of `order_completed` in PostHog.** The pixel's are attributed
  (`order_id`, the visit, `has_subscription`). The backup's are not
  (`$lib: formulate-webhook`). Revenue and order totals use both. Funnels and
  per-person reports only see the pixel's, so a funnel that ends in a purchase
  undercounts by exactly the orders the pixel missed.
- **Not anonymous to someone with Shopify admin.** An order's value and time
  could match it to a customer there. The event holds no identifier, and
  PostHog can't make that match, but it's pseudonymous at most, not provably
  anonymous. UK GDPR's legitimate interests is the basis for it. There's no
  storage on or access to the shopper's device, so PECR's consent rule isn't
  engaged. This doesn't rely on ADR 0010 (still proposed).
- **The secret doubles as the id key.** Rotating `SHOPIFY_WEBHOOK_SECRET`
  changes every order's id. That's harmless, except for a webhook retried
  across the rotation, which could count once more.
- **The one CORS header** will look like a mistake to someone who reads
  `apps/api/AGENTS.md`'s rule first. That file points here.
- ⚠️ This record reads the law as the project understands it. It isn't
  legal advice.

## Revisit when

- Shopify's order payload, or a webhook, carries the checkout's consent
  choice. The backup could then be attributed when consent was given.
- ADR 0010 is decided. Its exempt tier changes what the pixel itself may send
  without consent.
- The pixel can authenticate its note, which would remove the CORS exception.
