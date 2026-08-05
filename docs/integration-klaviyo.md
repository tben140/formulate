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
