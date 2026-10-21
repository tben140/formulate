# Double Helix: a case study

> **Draft.** Written from the repository, its decision records and measured
> findings. Sections marked **TODO (Ben)** need first-hand context that isn't
> written down anywhere yet. Everything else is sourced; the links say where.

One Shopify store, three storefronts: a Next.js web app, an Expo React Native
app and a Liquid theme, in one repository. This is about the decisions behind
that, what each one cost, and what went wrong. The features are in the
[README](../README.md) and on the live site.

## 1. The problem

> **TODO (Ben):** why headless, why both platforms, and why a supplement
> subscription store. Two or three sentences in your own words: what you
> wanted this project to prove, and to whom.

What the repository does record is the constraint that shaped everything else:
three surfaces must look and behave like one shop, without three times the
maintenance. Every decision below is an answer to "what, exactly, should be
shared?"

## 2. What's shared, and what deliberately isn't

The short answer, from [ADR 0005](adr/0005-parity-means-design-not-data.md):
**parity is the design system, not the data layer.**

| Shared                                                                        | Not shared, on purpose                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design tokens: one TypeScript source generates the CSS all three surfaces use | UI components: a `<View>`, a `<div>` and a Liquid `{% render %}` aren't the same thing, and an abstraction over all three would fit none                      |
| The Storefront client, queries and generated types, for the two React apps    | The theme's data: it reads Liquid server-side, because fetching over the API from the browser would delay first paint on the surface where SEO matters most   |
| URL paths, enforced by a parity test that reads both apps' route files        | Checkout: web redirects, the app presents Shopify's native sheet, the theme uses Shopify's own ([ADR 0006](adr/0006-checkout-handoff-differs-per-surface.md)) |
| Filter URLs (`?filter.v.option.flavour=Vanilla`), the same format Liquid uses | Cart persistence: a cookie on web, the keychain on iOS ([domain model](domain-model.md#cart))                                                                 |

The rule that falls out of this: share what must be identical for the shopper,
and nothing that would force one platform to behave like another.

## 3. Decisions, and what was rejected

Each of these is recorded as an ADR with its alternatives. Here's the gist,
and what would change the answer.

**Tailwind v4 on both React apps, via a preview NativeWind**
([ADR 0003](adr/0003-nativewind-v5-and-tailwind-v4.md)). Stable NativeWind only
supports Tailwind v3, so sharing one token file meant the v5 preview. Rejected:
generating tokens twice in two formats (the fallback, still on record), and
Tailwind v3 everywhere. The price was real. NativeWind v5 needs exactly
`lightningcss` 1.30.1, and anything newer fails only at Metro bundle time,
never at install ([ADR 0004](adr/0004-pin-lightningcss-to-1-30-1.md)). _Would
change:_ NativeWind v5 going stable, or another preview break.

**Mobile marketing consent goes through a Cloudflare Worker**
([ADR 0007](adr/0007-mobile-consent-goes-through-a-worker.md)). Web and the
theme record consent straight from the browser with Klaviyo's public key. The
app couldn't, and three routes were tried and closed in turn:

- **Klaviyo's React Native SDK:** it has no consent API.
- **The browser's client endpoint, from React Native:** Cloudflare answered with
  a 403 challenge, and only after repeated requests. That's a dependency that
  passes a demo and fails a user.
- **Klaviyo's in-app forms:** they can't collect consent.

So a Worker holds a scoped private key, builds the payload itself (the caller
sends only an address) and rate-limits by IP. It's a separate deployable
rather than a route in the web app, to keep the key out of the storefront's
environment. _Would change:_ Klaviyo adding consent to its mobile SDK.

**Our own tracking-consent banner on web**
([ADR 0008](adr/0008-headless-tracking-consent-is-our-own.md)). Web was sending
Klaviyo events for everyone while the theme asked first, measured minutes apart
on the same store. The ticket assumed Shopify's privacy API was unavailable
headless; it wasn't, so it was weighed properly. The cookie and the gate (the
script doesn't load without consent) are ours.

**Shared URLs, checked by a test.** Product and collection paths are the same
on web and in the app, so a shared link works anywhere. A test reads both
apps' route files and fails if either has a page the contract doesn't list,
with the exceptions declared, each with a reason.

**Checkout per platform** ([ADR 0006](adr/0006-checkout-handoff-differs-per-surface.md)).
A web view in the app would have made the surfaces identical, but loses Apple
Pay and, decisively, the completion callback. No shared `startCheckout()`
either: there is nothing honest to put behind one.

**Subscriptions through the Worker, not the browser.** Recharge's
customer-facing Storefront API, and the JS SDK built on it, need a plan this
store doesn't have. The SDK itself would have worked in React Native (tested
without a DOM: only its card-entry helpers need a browser), so the plan was
the real constraint. The portal reads and changes subscriptions through the
Cloudflare Worker with Recharge's Admin key instead. The Worker takes a
subscription id only as a question: it fetches that subscription and acts
only if its Recharge customer is the caller Shopify verified, and returns
"not found" otherwise, so ids can't be probed.

**Subscription claims as pure functions, with the law beside them**
(#141). "Save £2.39 a delivery", the struck-through price, the price per day
and the renewal terms are computed once, in `packages/shopify`, and rendered
by all three surfaces (the theme restates them in Liquid). The comment above
the code says why each is lawful: the struck-through price is the same
product's one-time price on sale now, a comparison of two real offers (UK
CMA guidance under the DMCC Act; the FTC's 16 CFR 233), never a "was" price;
the renewal terms sit beside every button that buys, sticky bars included
(California's Automatic Renewal Law now, the UK's subscription rules from
2027). A plan whose price rises after an introductory period gets no saving
claim at all, rather than one that's only true at first. Rejected: per-surface
copy, which is how three shops end up making three different promises.
_Would change:_ a sale on one-time prices (SHO-180), which would make the
comparison run the other way.

**The plan sets the quantity** (#143). Every product is a 30-day supply, so a
plan that renews every 90 days has to ship three, at three times the price. The supply
comes from Recharge's own plan option ("90-day"), not a table of our own, so
a new plan needs no code. Rejected: 60- and 90-day pack variants on every
product, which would have split stock three ways.

**Express checkout, one-time only on product pages** (#144). Shop Pay and
Apple Pay can complete a purchase without Shopify's checkout page, which is
where the subscription terms are otherwise shown. Their product-page buttons
can't carry a selling plan anyway, so they appear only while one-time is
selected, and every cart holding a subscription states the renewal terms above
all its ways to pay. Web's product-page Shop Pay goes through a route of our
own that builds the cart through the Storefront API because Shopify's cart
permalinks are served by the online store, which a password-protected store
doesn't serve. _Would change:_ wallet buttons that carry selling plans.

**Free gifts as nested cart lines and a discount Function** (#145, #146). The
gift is a real product, added under the product it comes with, so Shopify
shows it beneath it in cart, checkout and the order, and removes it with it.
A discount Function makes it free only while it sits under a product that
gives it, so it can't be had on its own; the stack discount ignores nested
lines, so a free gift can't complete a "3 different products" offer. Which
gift, if any, is a field on the product, not code. Rejected: a Cart Transform
expanding the product into a bundle, which changes what the order and stock
records say was sold.

**Performance on iOS in CI** (SHO-26) was dropped for v1. Lighthouse gates web
and the theme; the app's tests cover behaviour, not speed.

## 4. How the work was done

> **TODO (Ben):** your account of the agent-orchestrated workflow: Linear as
> the context layer, `AGENTS.md` as durable knowledge, the agent-ready gate,
> and where parallelism stopped paying off.

Observable from the repository and PRs: each ticket became a branch in its own
git worktree. Work that depended on unmerged work was stacked as a chain of
PRs. An integration branch merges every open PR, so they're tested together
before review: in one check, 12 open PRs combined passed lint, typecheck,
unit tests and build, plus 75 web, 10 app and 16 theme end-to-end tests.

## 5. What went wrong

The useful part. Each of these was found by measuring rather than assuming,
usually after an assumption had already shipped.

- **A performance ticket chased a phantom.** Lighthouse reported 2.2–2.7 s of
  "render delay" on product and collection pages, and a ticket was opened to
  cut JavaScript. Lighthouse's default throttling is _simulated_: it models a
  slow phone from a fast load, and there our scripts arrived before the image
  from Shopify's CDN, so the model blamed them. Under real throttling the delay
  was about 0.1 s. The actual cost was three images racing each other on a
  phone where one is on screen. Fixing that took collection LCP from 2.81 s to
  2.20 s ([surface-web.md](surface-web.md)).
- **A rate limiter that limited nothing.** Cloudflare's `ratelimits` binding
  deployed cleanly and returned success on every request, past its limit, in
  bursts and minutes apart. Its docs call it "intentionally designed to not be
  used as an accurate accounting system". It was replaced with a Durable Object
  ([ADR 0007](adr/0007-mobile-consent-goes-through-a-worker.md)).
- **A touch bug that wasn't a touch bug.** The app's footer sign-up "received
  no touches" on the simulator, and the theory was a view outside its parent's
  bounds. On a real phone, with touch logging, the tap arrived but went to
  dismissing the keyboard: React Native's default for scrolling views. One
  prop fixed it.
- **The app was downloading 1.5 MB per thumbnail.** Every image loaded the
  original upload, and Shopify's CDN picks the format from the `Accept`
  header, which React Native's loaders don't set to WebP. A collection screen
  was about 9 MB of PNG; it's now about 30 KB.
- **A fix that broke focus.** Making the cart drawer's heading focusable, for
  one feature, made it the dialog's first focus for every add to cart. The
  keyboard end-to-end test caught it when the PRs were run together.
- **Font files that didn't match the plan.** The plan was one family with the
  weight picking the face. In the files actually shipped, the weights don't
  share the expected family name ("DM Sans 9pt", and DM Mono Medium is a
  family of its own), so that grouping couldn't be relied on. Each face is now
  registered and chosen by name.
- **Merge strategy.** Combining branches with `-X ours` silently duplicated
  generated code (52 type errors). Recording already-applied branches needed
  `-s ours`, a different thing with a similar name.
- **Scanning the wrong theme.** The store's published theme is Shopify's
  default, not this repository's, so scanning the live storefront would have
  tested nothing of ours. The accessibility job pushes the PR's theme
  unpublished and scans that instead.

- **Checkout promised free delivery that renewals charged for.** A first
  order over £40 showed "free shipping every 30 days", but each renewal was
  re-priced on its own, under £40, at £3.95. The rule was right, and the
  promise was wrong: Shopify's recurring line is computed from the first
  basket. Free delivery now comes from a delivery profile attached to the
  subscription plans; a live renewal went from £17.51 to £13.56 when it
  recalculated. Recharge makes three plan groups per new product, outside the
  profile, so a script now checks for them.
- **One rate limit for every web customer.** The Worker limited each IP to 5
  requests a minute. Web calls it from its server, so every web customer
  shared one IP, and a single skip-then-undo used four requests. Signed-in
  routes now have a limit per verified customer, with a looser IP backstop.
  Found by the automated reviewer, not by a test.
- **An authorisation code on its way to Sentry.** For server errors, Sentry
  copied the full request path into a second field the scrubbing didn't
  cover, and a failed sign-in's path carries Shopify's authorisation code.
  Also found in review, and fixed before it shipped.
- **The same data, named differently.** Recharge's subscriptions name their
  customer `customer_id`; its charges name it `customer.id`. The first
  version of "undo a skip" checked the wrong one and would have refused
  every request. Caught by reading real records before building on them.

- **Three plans, one price.** Every 30-, 60- and 90-day plan showed £13.56
  because each shipped a single 30-day unit: a 90-day subscriber would have
  run out two months before the next delivery. The prices were "correct" for
  what was configured, and every test passed; it took looking at the page as
  a shopper to see it. The plan now sets the quantity (#143).

> **TODO (Ben):** the worktree bug and anything from the lab notebook. Add
> them here in the same form: what was assumed, what was measured, what
> changed.

## 6. Results

|                              |                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| LCP, real throttling (phone) | collection 2.20 s, product 1.92 s, search 1.98 s, home 1.61 s                                                             |
| Accessibility                | axe (WCAG 2.2 AA) in CI on web and the theme; in the app's end-to-end suite; screen-reader labels in the app's unit tests |
| Tests                        | Unit tests on the shared packages, the Worker and the app; end-to-end suites on all three surfaces                        |
| Review                       | Every PR reviewed twice: by Ben, and by an automated reviewer whose findings were fixed before merging                    |

> **TODO (Ben):** link the evidence pack (#74, SHO-80) once merged.

## 7. What I'd do differently

> **TODO (Ben):** your own issue, linked from here (SHO-83).
