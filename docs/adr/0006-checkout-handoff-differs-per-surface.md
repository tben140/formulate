# ADR 0006 — Checkout handoff differs per surface

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

Shopify owns checkout. No surface here implements payment; each hands the buyer
over and gets them back. The question is _how_, and the three surfaces have
genuinely different options — the platform gives web a URL and native a
component, and those are not the same shape.

The SHO-56 spike existed to answer this for the mobile app specifically, since it
was the only one where the choice was not obvious.

## Decision

Each surface uses its platform's native handoff, and no abstraction is built over
the three.

| Surface | Handoff                                              | Return signal                                                       |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Web     | Redirect to the cart's `checkoutUrl`                 | None — the browser navigates away and comes back on a new page load |
| Mobile  | `@shopify/checkout-sheet-kit` presented over the app | `completed`, then `close`                                           |
| Theme   | Shopify's own checkout, via the standard cart form   | None — same as web                                                  |

## Alternatives considered

**A web view in the mobile app, pointed at `checkoutUrl`.** Would make all three
surfaces identical, and needs no native module. Rejected: it loses Apple Pay,
loses the native presentation, and — decisively — loses the completion callback.
Detecting a completed order from inside a web view means URL sniffing, which
breaks whenever Shopify changes its checkout URLs.

**A shared `startCheckout()` abstraction across surfaces.** Rejected because
there is nothing honest to put behind it. Web returns void and never comes back
in the same execution context; native returns a lifecycle event stream. An
interface covering both would return the union and force every caller to handle
the case its own platform never produces.

**Shopify's Universal Links / app-to-browser handoff on mobile.** Rejected: it
leaves the app, which is precisely what Checkout Sheet Kit exists to avoid.

## Consequences

**A development build is mandatory for the mobile app.**
`@shopify/checkout-sheet-kit` is a native module, so **it cannot run in Expo
Go**. It needs no config plugin — autolinking picks it up through
`expo prebuild` — but CocoaPods must be installed locally for iOS.

**Cart-clearing logic is asymmetric, and this is the sharp edge.** Verified event
ordering on the mobile surface:

```
14:54:27   completed   ← carries the order id
14:55:41   close       ← fires when the confirmation screen is dismissed
```

`close` fires _after_ `completed`. A naive `onClose` handler that restores or
refetches the cart will undo a correct clear that already happened. **Clear on
`completed`; treat `close` as presentation only.**

Web has neither event. It clears the cart on the next request, by observing that
the cart is now completed — a different mechanism reaching the same state.

**Order identifiers do not match across the boundary.** The `completed` event
returns `gid://shopify/OrderIdentity/{id}`, which is **not** the Admin API's
`gid://shopify/Order/{id}`. Passing one where the other is expected fails at
lookup, not at type-check.

**Two small typing costs on mobile:**

- `colorScheme` takes the `ColorScheme` enum, not a string literal.
- A shim is needed for `Error.captureStackTrace`. The package sets
  `"types": "src/index.ts"`, pointing TypeScript at raw source, so `skipLibCheck`
  does not apply and the package's own source is typechecked in this workspace.
  The shim is narrower than pulling `@types/node` into a React Native app, which
  would wrongly imply Node globals exist at runtime.

**This was proved, not assumed.** A real test order completed on an iPhone 17 Pro
simulator: Shopify #1001, PAID, £774.90, producing an active Recharge
subscription (#854707192, £24.95 every 30 days). Shopify Payments test mode does
work with Recharge subscriptions.

## Revisit when

Shopify ships a checkout component for web with the same lifecycle events the
native kit has. At that point a shared abstraction would have something real to
cover, and the asymmetry recorded here would be worth removing.

## Related

- [Mobile app](../surface-mobile.md) · [Recharge](../integration-recharge.md) · [Domain model](../domain-model.md#cart)
