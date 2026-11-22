# ADR 0013 — A/B tests run on GrowthBook Cloud, for visitors who accept tracking

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The project wants A/B tests on every surface, measured on what a supplement
shop cares about: orders, revenue, the share of orders that are
subscriptions, and whether subscribers stay. Clicks are not enough.

What was already true:

- PostHog (SHO-87) carries one event vocabulary for web and the app
  (`packages/analytics`), sent with bare `fetch`, no SDK. It has experiments
  built in.
- Tracking is opt-in (ADR 0008). Web stores PostHog's anonymous id in
  `localStorage`, so the server cannot read it.
- Web renders in React Server Components and has a JavaScript budget
  (SHO-148). Every page already renders per request: the root layout reads
  the consent and cart cookies.
- Order outcomes reach the backend through Shopify's order webhook (#108),
  which carries cart attributes onto the order. #108 adds `_posthog_id` to
  the cart for order attribution.
- [ADR 0010](0010-aggregate-analytics-without-consent.md) (proposed, #113)
  reads the Data (Use and Access) Act 2025: A/B tests can fit the statistical
  exception, but linking a visitor id to purchases needs consent.
- The analysis is to run in the warehouse, Databricks, alongside order and
  subscription data that PostHog does not hold.

## Decision

**GrowthBook Cloud runs the experiments. Results are computed in Databricks.
Only visitors who have accepted tracking take part.**

### Who takes part

- **Visitors who have accepted tracking** (ADR 0008's Accept, or the app's
  tracking choice). Everyone else sees the control and is not counted. No
  experiment id is created or stored without consent.
- The experiment id **is** PostHog's anonymous id. One id joins the
  exposure, the funnel events and the order, so nothing new identifies a
  visitor.
- Withdrawing consent removes the id with the rest of the analytics storage.
  The visitor sees the control from then on.

### Where the variant is decided

| Surface        | Where                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**        | **On the server**, in the Server Component that renders the change. GrowthBook's JavaScript SDK runs only on the server, so the browser downloads none of it and the page never repaints into a variant. The anonymous id moves to a first-party cookie so the server can read it. |
| **Mobile app** | In the app, with GrowthBook's JavaScript SDK, from the id the app already keeps. Experiments change without an app release.                                                                                                                                                        |
| **Theme**      | **Not covered.** A parity override: `shop.` is dormant and the theme is a reference surface. Revisit if it takes real traffic.                                                                                                                                                     |
| **API Worker** | Not until an experiment needs a server-side decision, such as an offer or a price.                                                                                                                                                                                                 |

Checkout is Shopify's and is out of reach. Klaviyo emails use Klaviyo's own
A/B tests.

### What is recorded

- **Exposure** is an `experiment_viewed` event in the shared vocabulary,
  carrying the experiment key and the variant. On web the server decides, and
  a small client component sends the event when the page is actually shown,
  so prefetches and crawlers never count as exposures.
- **Outcomes** come from orders. The order carries `_posthog_id` from the
  cart (#108), and the warehouse joins it to exposures. Experiments add no
  cart attribute of their own.
- **Forcing a variant** with a query string is allowed for review and demos,
  and records no exposure.

### Where it runs

- **GrowthBook Cloud**, free plan. Its CDN serves the experiment settings.
  If the CDN cannot be reached, every surface shows the control.
- Two GrowthBook environments: `production` for the live site and store
  builds, `dev` for previews and local work. Preview deployments never use
  the `production` key, so testing never pollutes results.
- Every experiment key and variant name is defined once, typed, in a new
  `packages/experiments`, the same rule as event names: a string literal key
  in an app is a bug.
- **One experiment on a page at a time**, so one experiment's change can't
  muddy another's result. Pages already render per request (the root layout
  reads cookies), so an experiment adds no rendering cost.

### How results are read

- GrowthBook queries Databricks with a read-only token. Exposures arrive
  from PostHog, and orders from Shopify and subscriptions from Recharge are
  loaded alongside them.
- **What GrowthBook can read.** The token reads only the views it needs:
  exposures and attributed orders, keyed by the anonymous id, with order
  totals and whether an order had a subscription. No names, emails,
  addresses or IP addresses are in the warehouse at all. GrowthBook's
  queries summarise in Databricks and it keeps the summaries, but its
  query tests can show it sample rows, so it is a processor of those
  pseudonymous rows, not only of aggregates. The privacy notice says so.
- **The first experiment is an A/A test**, the same page in both arms. It
  proves the split is even and that two identical arms show no difference,
  before any real result is trusted.
- Traffic allocation is not changed while an experiment runs. A change
  starts a new phase.

## Alternatives considered

**PostHog experiments.** Already installed, and the quickest start. Rejected
because its results come from PostHog's own events, while the outcomes that
matter here, subscription retention and Recharge renewals, live outside it.
It also uses PostHog's SDK for flags, which web deliberately does without.

**Optimizely.** The warehouse-native analysis is a paid product with quoted
pricing. Its free plan, where it still exists, runs one experiment at a time
and analyses inside Optimizely.

**Self-hosting GrowthBook.** Considered on the development droplet, a second
droplet and Hetzner. It would show operations work, but it adds a server,
MongoDB, backups, upgrades and a tunnel to keep alive for a demo. Cloud does
the same job at no cost.

**Deciding the web variant in the browser.** GrowthBook's React SDK is the
default path. It adds JavaScript to every page, and the page shows the
control first and then repaints, which itself skews the result.

**Deciding the web variant in middleware and serving prebuilt variant pages**
(the Vercel Flags SDK "precompute" pattern). It exists to keep pages cached,
but these pages already render per request because the root layout reads
cookies. It would add middleware to every request and a built page per
variant, and buy nothing.

**Including visitors who have not accepted tracking**, under ADR 0010's
statistical exception. It would give larger samples. Rejected: the outcome
that matters is the order, and ADR 0010 itself puts linking an id to
purchases on the consent side.

## Consequences

- **Smaller, skewed samples.** Only visitors who accept take part, and they
  may shop differently from those who decline. Results describe consenting
  visitors.
- **The demo store has too little traffic for any real experiment to finish.**
  Its value is the working system and the A/A test. Any simulated traffic
  shown in a demo is labelled as such.
- **The anonymous id moves from `localStorage` to a cookie** on web. Without
  consent no cookie is set, as before. It is a change to how SHO-87 stores
  its id, and it needs migrating so current visitors keep their id.
- **The first page view after Accept always shows the control.** The cookie
  does not exist until the visitor accepts, so the server cannot assign them
  on that request.
- **Results wait for the warehouse.** Exposures are recorded from the first
  experiment, but nothing can be read until Databricks is loaded and
  connected.
- ⚠️ Looks wrong but isn't: `GROWTHBOOK_CLIENT_KEY` on web is not a
  `NEXT_PUBLIC_` variable. The key is not secret, but only the server needs
  it.

## Revisit when

- ADR 0010 is accepted and an experiment's outcome needs no purchase link
  (for example "reached the cart"). That experiment could include everyone
  who has not objected, with session-scoped ids.
- The theme takes real traffic.
- Pages start being served from Vercel's cache (for example, if the layout
  stops reading cookies). Variants would then have to be decided without
  breaking that cache, and the middleware approach comes back into question.
- GrowthBook Cloud's free plan changes.
