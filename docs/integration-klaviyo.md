# Integration: Klaviyo

**Status: planned. Nothing is built.** This note is design, and is written so
that the eventual implementation has something to be judged against.

## Why Klaviyo

Klaviyo is where Shopify merchants' lifecycle marketing actually lives. Its
value in this project is not the emails — it is that it forces the storefronts to
emit a **coherent event stream from three different runtimes**, and then makes
any inconsistency visible in a third-party UI that we do not control.

That last part is the point. An event stream that only ever gets read by its own
author can be quietly wrong for months.

Alternatives considered: Shopify's own marketing automation (too coupled to the
Online Store to say anything about the headless surfaces), and Customer.io
(capable, but not what Shopify merchants ask for).

## Scope

| In scope                                        | Out of scope                     |
| ----------------------------------------------- | -------------------------------- |
| Onsite tracking on web and theme                | Klaviyo's mobile SDK             |
| Viewed product, added to cart, started checkout | Push notifications               |
| Email capture form                              | SMS                              |
| One or two lifecycle flows                      | Full segmentation strategy       |
| Recharge subscription events → Klaviyo flows    | B2B / company-level segmentation |

The mobile app is deliberately excluded. Klaviyo's React Native SDK would need
another native module and another development build, and it demonstrates roughly
the same thing the web integration already does. That is depth where the current
priority is breadth.

## Events we intend to emit

| Event              | Fires from | Depends on               |
| ------------------ | ---------- | ------------------------ |
| Viewed product     | Web, theme | Nothing — can ship first |
| Added to cart      | Web, theme | Cart                     |
| Started checkout   | Web, theme | Cart                     |
| Subscribed to list | Web, theme | Email capture form       |

**Only the first is buildable today.** The rest wait on cart, which is why cart
sits at the head of the critical path — without it, the events worth having do
not exist to emit.

Order and refund events come from Shopify's own Klaviyo integration rather than
from our code. Emitting them ourselves would duplicate what the platform already
does reliably, and duplicated events are worse than missing ones.

## Identity

The hard part, and the reason this is worth doing at all.

### ⚠️ Identity is a precondition for events, not an enhancement

Established empirically on 2026-08-08, and it reshapes the whole plan.

**Klaviyo does not transmit events for an unidentified visitor.** It caches them
in the browser and sends nothing. The `cacheEvent` and `sendCachedEvents`
methods on the onsite global exist for exactly this. Observed:

| State                        | Network                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| Anonymous, event pushed      | **nothing leaves the browser**                                 |
| After `identify`, same event | `POST /client/event-bulk-create/` and `POST /client/profiles/` |

Nothing errors in the anonymous case. The script loads, the `__kla_id` cookie
appears, page-view tracking works, and the activity feed stays empty — which
reads exactly like a broken integration.

**This is not a headless problem.** It applies to the Liquid theme identically:
its automatic `Viewed Product` is cached and unsent for an anonymous browser
too. Any surface, same behaviour.

Two consequences:

1. **Email capture is a dependency, not a follow-on.** Without some way to
   identify a visitor there is nothing to demonstrate, because no event ever
   reaches Klaviyo.
2. **Verifying an event means identifying first.** "Browse the site and check
   the feed" will always show nothing.

### ⚠️ Onsite tracking cannot be verified over plain HTTP

Klaviyo builds its API URLs from the page's own protocol. On an `http://` page
— which `next dev` serves by default — the profile call goes to
`http://a.klaviyo.com` and fails outright, while the event call still succeeds.
The result is the worst kind of half-working: events accepted, no profile to
attach them to, nothing in the feed.

Measured on the same commit, same key, only the scheme differing:

| Endpoint                 | `http://localhost:3100`       | production HTTPS |
| ------------------------ | ----------------------------- | ---------------- |
| `POST /client/profiles/` | **status 0, failed, 0 bytes** | **202**          |
| `POST /client/events/`   | 202, orphaned                 | **202**          |

So **verify on a deployed HTTPS origin, never on `next dev`.** Every local
signal looks healthy meanwhile — script loaded, `__kla_id` set, page-view
tracking working.

`next dev --experimental-https` was tried and did not engage; the Vercel
deployment is the practical test rig.

### ⚠️ Klaviyo silently discards addresses it judges fake

**This is what cost the most time, and it is invisible from the client.**

Klaviyo validates email addresses on the client/Identify path and drops
anything that looks like test data — `@example.com`, `@test.com`, and
addresses containing words like `test`, `invalid` or `fake`. There is **no
public list** of the patterns. The API returns `202` either way.

The decisive evidence is on this very account. Compare two profiles:

| Address                     | Created via                                   | In Klaviyo? |
| --------------------------- | --------------------------------------------- | ----------- |
| `cart-test@example.com`     | Shopify order sync (server-side, private key) | **yes**     |
| `klaviyo-probe@example.com` | `/client/events/` (client-side, public key)   | **no**      |

Same account, same domain, different path. **The server-side integration does
not apply the filter; the client-side one does.** So a store can be full of
`@example.com` profiles from seeded orders while every client-side attempt at
the same domain vanishes.

**When testing, use a plausible address.** Not `@example.com`, and without the
words `test` or `fake` in it.

### Not the cause: domain allow-listing

Worth recording as ruled out, because it is the intuitive first suspicion.
Klaviyo does restrict domains — but only for **forms**, not for events. Onsite
tracking is not scoped to an allow-list, so events from a `*.vercel.app`
origin are not rejected for that reason.

What _is_ domain-bound is the cookie: Klaviyo's onsite tracking is per-subdomain
and does not use third-party cookies. That confirms the identity note above —
the theme and the web app genuinely cannot share an anonymous profile.

### The other silent behaviours in this API

- `202` means _validated and queued_, never _recorded_. There is no response
  that tells you an event was dropped downstream.
- Events are processed asynchronously and take time to surface.
- **Client-side endpoints cannot update an existing profile's identifiers.**
  Klaviyo's own docs: attempts "will return a 202, however the identifier
  field(s) will not be updated." Changing an email needs a private key and a
  server-side call.

### Status: transport proven, delivery still to confirm

HTTPS fixed the _transport_ and did **not** make events appear. As of
2026-08-08 the position is:

- Both endpoints return **202** over HTTPS
- A textbook direct call to `POST /client/events/` with a `revision` header
  and a full `profile` block also returns **202**, empty body
- No matching profile or event appears in the Klaviyo dashboard

Every probe used an `@example.com` address, which is the most likely reason
none of them landed — see above. Re-testing with a plausible domain is the
outstanding step.

Do not treat the web integration as verified until an event is visible in the
feed with a real-looking address.

A browser session is anonymous until something identifies it. Klaviyo's onsite
JavaScript maintains its own cookie; the theme and the web app are **different
origins**, so a visitor browsing both is two profiles until an email address
merges them.

Design position:

- Identify on **email capture** and at **checkout**, and nowhere else. Guessing
  earlier produces confidently wrong profiles.
- Accept that pre-identification sessions on different surfaces do not merge.
  Pretending otherwise would mean fabricating a cross-origin identifier, which is
  both fragile and a privacy decision nobody asked us to make.
- Treat the Shopify customer id, not the email, as the join key once one exists —
  emails change.

## Flows

Two, chosen because they exercise different trigger types:

1. **Abandoned cart** — triggered by `started checkout` with no subsequent order.
   Tests that our own emitted events are well-formed enough for Klaviyo to reason
   about timing.
2. **Subscription upcoming charge** — triggered from Recharge. Tests the
   cross-system path, with no code of ours in the trigger at all.

## Recharge → Klaviyo

Subscription lifecycle events into Klaviyo flows: upcoming charge, charge failed,
cancelled. Largely configuration in the Recharge admin.

High value per hour: it produces genuine cross-system behaviour for very little
build, and it is the only part of this integration that demonstrates anything
about systems we do not own. See [Recharge](integration-recharge.md).

## Verification

Not "the code ran". **Events must be visible in Klaviyo's own activity feed**,
and a flow must be observed firing from a real trigger. An integration verified
only by its own logs has not been verified.

## Privacy

Onsite tracking sets cookies that are not strictly necessary, which is a consent
question in the UK and EU. The current position is that this is a demonstration
store with no real customers, and a consent banner is out of scope — but it is a
real gap and should be stated as one rather than left for someone to notice.

Note the contrast with Vercel Analytics on the web surface, which is cookieless
and therefore clear of this entirely.

## Related

- [Recharge](integration-recharge.md) · [Domain model](domain-model.md)
- [Web storefront](surface-web.md) · [Liquid theme](surface-theme.md)
