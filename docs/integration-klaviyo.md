# Integration: Klaviyo

**Status as of 2026-08-08:** onsite tracking and the three commerce events are
live on web and theme and verified in Klaviyo's own feed. Email capture ships
on both surfaces. Mobile events and the lifecycle flows are outstanding.

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

Klaviyo's **SDK** was excluded on mobile: it needs another native module and
another development build to demonstrate roughly what the web integration
already does.

⚠️ **That reasoning assumed the `/client/` endpoints were reachable from a
native app. They are not** — see below. The conclusion stands for the SDK's
*features*, but not as a route to the same endpoints over plain `fetch`.

## Events we intend to emit

| Event              | Fires from | Status                             |
| ------------------ | ---------- | ---------------------------------- |
| Viewed product     | Web, theme | Shipped                            |
| Added to cart      | Web, theme | Shipped                            |
| Started checkout   | Web, theme | Shipped                            |
| Subscribed to list | Web, theme | Shipped — see Email capture below  |

The theme emits the first three automatically through Klaviyo's app embed, with
no code from us. The headless surfaces build the same payloads by hand in
`packages/analytics`, which exists precisely so the two cannot drift: its tests
assert against a payload captured from the running theme. A `ProductID` sent as
a Storefront gid rather than a legacy numeric id would produce events that look
correct in Klaviyo and never match a theme-generated one, splitting every
segment in two with no error anywhere.

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
   reaches Klaviyo. This reordered the plan — see Email capture below.
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

### Resolved

Confirmed on 2026-08-08: a probe from a real domain landed, with its `Viewed
Product` attached. The web integration is verified end to end.

The sequence of four silent failures that led here is worth keeping, because
each one looked exactly like the others from the outside — a healthy-looking
page and an empty dashboard:

1. Events pushed to `window.klaviyo` instead of `_learnq`
2. Anonymous visitor, so events were cached and never transmitted
3. `http://localhost`, so the profile call failed while events still 202'd
4. `@example.com`, so the profile was discarded server-side

Only the first was a bug in our code.

## Email capture

Shipped on web (`apps/web/components/email-capture.tsx`) and theme
(`apps/theme/assets/email-capture.js`), sharing payload, validation and
transport through `packages/analytics/src/subscribe.ts` — except the theme,
which reimplements them in plain JavaScript because it ships ES modules with no
build step and cannot import a TypeScript workspace package. Same boundary as
the cart.

Mobile has it too (`apps/mobile/components/email-capture.tsx`), sharing the same
package — see the identity note below for the one part that differs.

**Two steps, and the second is the one that matters:**

| Step                         | Effect                                                   |
| ---------------------------- | -------------------------------------------------------- |
| `POST /client/subscriptions/` | Creates the profile, records consent. Durable.           |
| `_learnq.push(["identify"])`  | Tells the script in **this tab** who the visitor is.      |

Step 1 alone leaves the session anonymous, so every event cached during it
stays cached. The profile appears in Klaviyo with no history attached, which
reads as a working integration that collects nothing.

### Step 2 has no equivalent on native

There is no `klaviyo.js` in the Expo app, no `__kla_id` cookie, and therefore
nothing caching events and nothing to flush. The identity is **ours to store**:
`apps/mobile/lib/klaviyo.ts` writes the subscribed address to the OS keychain,
and that is what a later `POST /client/events/` (SHO-109) attaches events to.

So the same two-step shape holds on all three surfaces, but the second step is
a call into someone else's script on two of them and a write to our own storage
on the third. Worth stating plainly, because "identify" reads like one
mechanism and is in fact two:

| Surface | Identity lives in                    | Releases cached events? |
| ------- | ------------------------------------ | ----------------------- |
| Web     | `klaviyo.js` + `__kla_id` cookie      | **Yes** — that is the point |
| Theme   | `klaviyo.js` + `__kla_id` cookie      | **Yes**                 |
| Mobile  | `expo-secure-store` (OS keychain)     | Nothing to release      |

Verified by killing the app and cold-starting it: the address survives, which
is the property SHO-109 depends on.

### ⚠️ `/client/` endpoints are browser-only in practice, not just by docs

**Cloudflare blocks them from a native app.** Klaviyo fronts `a.klaviyo.com`
with bot protection, and a React Native `fetch` sends no `Origin`, no `Referer`
and a `CFNetwork/Darwin` user agent — so it is challenged and refused.

The response is not a Klaviyo error at all. It is an HTML interstitial:

```
403  <!DOCTYPE html> … "You are unable to access klaviyo.com" … Ray ID
```

Measured on one machine, one IP, within the same minute:

| Client         | `/client/profiles/` | `/client/subscriptions/` |
| -------------- | ------------------- | ------------------------ |
| Browser        | **202**             | **202**                  |
| React Native   | —                   | **403, Cloudflare HTML** |

So it is the shape of the client, not the address of it. Reproduced twice, and
note it did **not** fail on the first attempt hours earlier — Cloudflare's
challenge appears to escalate with repetition, which makes this exactly the
kind of thing that passes a demo and fails a user.

**Consequences:**

1. **SHO-109 cannot be "the same payloads over `fetch`".** The plan said
   `/client/events/` needs no SDK because it is plain HTTP. True of the
   protocol, false of the gateway.
2. Klaviyo's React Native SDK exists **for this reason**, not merely as
   convenience packaging. That reframes it from optional to load-bearing.
3. ⚠️ Do **not** work around this by spoofing a browser user agent. Defeating
   bot protection to reach an endpoint the vendor points elsewhere is both
   wrong and fragile.

**Adopted: Klaviyo's React Native SDK.** Shipped and verified — the native
networking is not challenged by Cloudflare, and identification works from the
app.

No config plugin was needed. `klaviyo-expo-plugin` exists but only automates
**push notification** setup, which this app does not want; autolinking picks
the SDK up through `expo prebuild` exactly as it does Checkout Sheet Kit. The
React Native 0.86 risk did not materialise — pods install and the app builds,
despite the SDK being tested against 0.78.

### ⚠️ But the SDK cannot record consent

`Profile` has no subscriptions field and there is no subscribe method —
identity and events only. This is deliberate on Klaviyo's part, and defensible:
a marketing consent record carries legal weight, so an arbitrary mobile client
is not allowed to write one.

**So mobile identifies but does not subscribe**, and its copy says so. Web and
theme offer a newsletter because they send an explicit consent block; the
mobile form promises only what it delivers. Restoring the marketing wording
before a consent route lands would be collecting an address under a promise
nothing has recorded.

Two routes remain for consent on mobile, and neither is chosen yet:

| Route | Trade |
| --- | --- |
| **Klaviyo in-app forms** (`registerForInAppForms`) | Vendor's answer. Handles consent properly, but the form is designed in Klaviyo's dashboard, so our custom UI is replaced by theirs. |
| **Server-side call** from `apps/web` | Keeps our UI. Needs a private key and an authenticated endpoint — see the rejection note below, which applies with less force now that it would be a *complement* to the SDK rather than a replacement for it. |

### Prior recommendation, superseded

The objection that mattered — another native module and another development
build — **this app has already paid**. `@shopify/checkout-sheet-kit` is a
native module, Expo Go is already ruled out, and `expo prebuild` is already the
workflow. One more autolinked module is incremental. No Apple Developer account
is needed either: only push notifications require APNs, and identify and events
do not.

⚠️ Risk worth stating: the SDK is developed and tested against **React Native
0.78**, and this app is on **0.86**. It claims 0.70+ support, but this repo has
twice been bitten by version incompatibilities that failed only at Metro bundle
time with errors naming something else entirely — see ADR 0003 and ADR 0004.
Treat adopting it as a spike with a build-or-don't outcome.

A **server-side proxy** on `apps/web` was considered and rejected. It would
dodge Cloudflare, but it needs a Klaviyo private key with broad account access
sitting behind an unauthenticated public route handler — anyone finding the URL
could write arbitrary profiles and events. Securing that properly means rate
limiting, origin checks and probably app attestation: real work, to reimplement
worse what a supported SDK already does, while coupling the mobile app to the
web deployment.

Until one lands, mobile's form fails honestly: the shopper sees "Something went
wrong at our end", their address is preserved, and the Cloudflare body is
logged in full.

### ⚠️ There is no already-subscribed state

Klaviyo returns `202` with an empty body whether the profile is brand new or has
been on the list for a year — subscription is processed asynchronously, long
after the response is sent. Telling the two apart needs a **private** key and a
server-side lookup, which this project deliberately does not have.

So both surfaces say **"You're on the list"**, which is true either way, rather
than "Thanks for subscribing", which is a claim the API does not support.
`SubscribeResult` has no `already-subscribed` variant for the same reason: a
type should not be able to represent a state you cannot observe.

### Configuration

| Surface | Public key                        | List id                        |
| ------- | --------------------------------- | ------------------------------ |
| Web     | `NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY`  | `NEXT_PUBLIC_KLAVIYO_LIST_ID`  |
| Theme   | `settings.klaviyo_public_key`     | `settings.klaviyo_list_id`     |

Both values are public by design — the onsite key is scoped to writing events
and subscriptions for one account and is meant to ship in client code, and a
list id names a destination rather than a permission. The theme's live in
`config/settings_data.json` rather than the theme editor, because
`.shopifyignore` does not exclude that file and a `theme push` would overwrite
whatever the editor set.

The theme renders the form only when both are present, so a store without
Klaviyo configured gets a clean footer rather than a form that cannot work.

### ⚠️ A segment's URL also says `/list/`

Only a **list** can be subscribed to. A segment is a dynamic query — a
description of who matches, evaluated continuously — so there is nothing to add
anyone to, and `/client/subscriptions/` rejects it.

Klaviyo files both under *Lists & Segments*, and — the part that costs the time
— **the URL is `www.klaviyo.com/list/<id>` for both.** There is no way to tell
them apart from the browser bar. Checking the URL is a natural instinct and it
gives the wrong answer with total confidence.

What it looks like when you get it wrong:

```
POST /client/subscriptions/  →  400
{"errors":[{"code":"invalid","detail":"List not found",
  "source":{"pointer":"/data/relationships/list"}}]}
```

⚠️ **That message is identical for a segment id and for an id that does not
exist at all** — verified by probing a real segment and an invented `ZZZZZZ`
side by side. So it reads as "wrong account" or "typo" long before it reads as
"that's a segment", which is exactly the wrong trail.

Tell them apart inside Klaviyo instead: a list offers subscribe/unsubscribe
controls and an import button; a segment shows its definition rules and cannot
be added to.

Worth noting what this endpoint got *right*, given the rest of this document.
It is the only part of the integration that reports a real cause: a wrong id
returns a 400 naming the field, where `/client/events/` and `/client/profiles/`
return `202` and discard the data. Both surfaces log the body for that reason —
throwing it away is discarding the only diagnostic Klaviyo offers anywhere.

### Identity, in general

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
