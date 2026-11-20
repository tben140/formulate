# ADR 0010 — Aggregate analytics run without consent; anything personal still asks

- **Status:** Proposed. If accepted, it supersedes part of [ADR 0008](0008-headless-tracking-consent-is-our-own.md) (see "What changes in ADR 0008").
- **Date:** 2026-10-16 (updated 2026-11-12 for ADR 0012)

## Context

ADR 0008 put every tracker behind one opt-in: Klaviyo, and later PostHog (#93),
the app's choice (#107) and the order pixel (#108). That was right under PECR
as it stood: almost any storage on a shopper's device needed consent first.

**The law has changed since.** The Data (Use and Access) Act 2025 replaced
PECR regulation 6 and added Schedule A1, with exceptions to the consent rule.
They came into force on 5 February 2026. The ICO finalised its guidance on
29 April 2026.

The **statistical purposes** exception (Schedule A1 paragraph 5) allows
storage and access without consent when **all** of these hold:

1. the service is an information society service. Paragraph 1 says "website"
   includes a mobile application, so the app is covered as well as web;
2. the **sole** purpose is collecting statistics on how the service is used,
   to improve it;
3. the information isn't shared, except so that someone else can help make
   those improvements;
4. the shopper gets clear and comprehensive information about the purpose;
5. the shopper gets a simple, free way to object, and doesn't object.

And one limit, paragraph 5(2): the access it allows "does not include ...
collecting or monitoring information automatically emitted by the terminal
equipment". So the exception can't be the basis for collecting what a device
sends on its own, such as its IP address or user agent; see "Device details"
under the decision.

The ICO's guidance narrows it further:

- It covers **aggregate** statistics, "how your service is used, not who uses
  it". It is "not for identifying, tracking or monitoring people", and
  inferences or decisions about people fall outside it.
- Individual-level data may be collected, but only kept as long as needed to
  produce the aggregates.
- A third-party provider can do the work, as a **processor** that doesn't
  combine the data with anything else or use it for its own purposes.
- **Session recordings** need consent. **A/B tests** and aggregate figures
  (scroll depth, hits per section) are given as examples that fit.
- Connecting a visitor id to their activity, for example linking purchases
  to it, is listed as needing consent.
- The way to object can be a default-on toggle in the existing consent
  controls. Browser settings alone don't count. Once someone objects, storage
  and access must stop.

UK GDPR still applies to whatever personal data the analytics touches, so a
lawful basis (legitimate interests) and privacy-notice wording are still
needed. The exception removes the PECR consent requirement, nothing else.

**What this means for PostHog:** most of what #93 sends is aggregate funnel
data, which fits. Three things don't:

| Feature                                                                                  | Why it doesn't fit the exception      |
| ---------------------------------------------------------------------------------------- | ------------------------------------- |
| A **persistent** anonymous id that follows a visitor for months                          | Monitoring an individual over time    |
| **Order attribution** (#108: `_posthog_id` on the cart, `order_completed` under that id) | Links a visitor id to their purchases |
| **`identify()` at sign-in** (SHO-172)                                                    | Ties activity to a known person       |

**Since this was proposed:** [ADR 0012](0012-the-order-backup-is-anonymous.md) (in #108)
(accepted 2026-11-12) counts every order in PostHog from Shopify's order
webhook, anonymously: no visitor id, no order id, no person profile. It runs on
the server and touches no device, so it needs neither consent nor this
exception. Order and revenue totals are complete whatever is decided here.
What this record still decides is everything that runs on the shopper's device,
including the attributed `order_completed` from the checkout pixel.

## Decision

**Two tiers, on web and in the app.**

|           | **Usage statistics** (exempt)                                                                             | **Personalised tracking and marketing** (consent)                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default   | **On**, with a clear off switch                                                                           | **Off** until the shopper accepts                                                                                                                              |
| What      | PostHog events with a **session-scoped** id and **no person profiles** (`$process_person_profile: false`) | Klaviyo; the ad tags (#101, #102); PostHog's persistent id, `identify()` and order attribution (#108's cart attributes); the Shopify pixel's `order_completed` |
| Banner    | Explained in the banner and the privacy notice                                                            | The existing Accept / Decline choice                                                                                                                           |
| Objecting | Turning it off stops all further PostHog storage and sending (see "Objecting" below)                      | Declining or withdrawing works as in ADR 0008                                                                                                                  |

- **The session id lives only for the session**, and so does PostHog's own
  storage. An id kept in our `sessionStorage` isn't enough if the SDK keeps
  its default persistence, which would reuse its `distinct_id` across visits.
  So the exempt mode starts PostHog with non-durable persistence
  (`persistence: "sessionStorage"` in posthog-js on web, `"memory"` in the
  app's SDK) and a fresh id each session. "Session" here means the storage's
  lifetime, not PostHog's own analytics session: on web, a browser tab until
  it closes (`sessionStorage`); in the app, the app's process until it's
  closed or restarted (`memory`). A new tab or a restarted app gets a new id.
  Funnels are counted per session, which is enough to see where shoppers drop
  off.
- **No person profiles, and raw events deleted once aggregated.**
  `$process_person_profile: false` stops profiles, but PostHog still stores
  each event under its session id, and that isn't aggregate data just because
  no profile exists. The ICO's guidance is that keeping individual-level data
  after aggregation falls outside the exception, so raw exempt-tier events are
  kept only until their month's figures are safe:
  1. **A monthly job, early in the next month** (by the 7th), exports the
     month's aggregate figures (counts by page, step and funnel stage, nothing
     per id) to a durable store of our own.
  2. It checks the export against PostHog's totals for that month.
  3. **Only when the check passes**, it deletes that month's raw exempt-tier
     events. So raw events live about five weeks at most: the month itself
     plus the days to the job.
  4. If the check fails, nothing is deleted, the job alerts, and it retries
     daily.
  - **PostHog's retention setting is no deadline.** PostHog deletes
    expired events in batches and says they "may be stored longer than your
    retention period", with no guaranteed date. On the Free plan the window is
    fixed at a year and can't be shortened. So it bounds nothing this decision
    relies on.
  - **The bound we enforce instead:** if a month's raw events still aren't
    deleted by the end of the following month, the exempt tier stops
    collecting (its events are switched off in the app and the site) until
    they are. Raw events then live about two months at worst, and no new
    exempt-tier data piles up behind a failing job.
  - **Open before this is accepted:** confirm how the job deletes a month of
    anonymous events, and how soon PostHog actually removes them. PostHog
    documents deleting a person with their events, but these events have no
    person profiles, and its batch deletions run asynchronously with no stated
    deadline. If there's no verified way, the exempt tier waits.
  - Insights computed from raw events empty as they're deleted. The exported
    aggregates are what's kept. Exempt-tier ids are never aliased or
    identified later.
- **Device details.** Paragraph 5(2) means the exception doesn't cover
  collecting what the device emits on its own, so the project discards client
  IP addresses (and with them IP-based location). Beyond what the law
  requires, and as a privacy control of our own, the SDK's device properties
  from the user agent and screen (browser and OS versions, screen and
  viewport size, device type) are left out too: posthog-js's
  `property_denylist` on web, and the app client's equivalent (to confirm
  when #107 changes). The events keep only what our code sends: the page or
  screen and the step.
- **Objecting** stops future capture: storage is cleared and nothing more is
  sent from that browser or app. Events already sent before the objection
  aren't deleted on the spot; they follow the deletion rule above, and carry
  only a session id that can't be traced back to the shopper.
- **Upgrading.** When a shopper accepts the marketing tier, the client first
  calls `posthog.reset()`, which discards the session-scoped id, then switches
  to persistent storage with person profiles, and only then may call
  `identify()`. Calling `identify()` without the reset would merge the earlier
  anonymous id and its events into the person, which is exactly the linkage
  this tier exists to avoid. Order attribution turns on after the switch.
  Events from before the choice stay unlinked.
- **PostHog's role** is recorded as processor: EU Cloud, its data processing
  agreement, and no use of the data for its own purposes. Autocapture, replay
  and heatmaps stay off, as in SHO-87.
- **Lawful basis** under UK GDPR for the exempt tier: legitimate interests,
  with a short legitimate interests assessment in this folder, and a privacy
  notice that says what is collected, by whom, and how to turn it off.

## What changes in ADR 0008

- **Superseded:** "one choice gates every tracker". Usage statistics move to
  the exempt tier. Everything else stays opt-in exactly as ADR 0008
  describes, including Klaviyo's script not loading before consent.
- **Corrected:** ADR 0008's first reason for not using Shopify's Customer
  Privacy API ("it needs the Storefront token in the browser") overstated the
  problem. Our token is Shopify's **public** Storefront token, designed to be
  in browsers and already shipped in the app. Keeping it server-side is our
  own choice, not a security limit. The other reasons stand, and
  framework-agnostic Hydrogen 2026.10 (SHO-170) may remove them: see that
  spike.

## Alternatives considered

**Keep everything opt-in (ADR 0008 as it is).** The safest reading, and still
lawful. But funnels only count shoppers who click Accept, which skews every
conversion rate towards the shoppers most willing to share data. The
exception exists for exactly this kind of analytics.

**Make all of PostHog exempt, persistent id and order attribution included.**
Rejected: the ICO lists linking an id to purchases, and monitoring
individuals, as outside the exception. A regulator reading the purchase
linkage as tracking would be right.

**Exempt tier with a persistent but anonymous id.** Closer to the line. A
long-lived id that follows a visitor across visits is the "monitoring
individuals" the guidance excludes, even without a name attached. The
session-scoped id avoids the question.

## Consequences

- **More complete numbers.** Sessions, funnels and A/B tests count every
  shopper who doesn't switch it off, not just those who accept.
- **Two kinds of analytics in PostHog.** Session-level aggregate events from
  everyone, and person-level journeys only from those who accepted. Reports
  must say which they use. A funnel that ends at `order_completed` only works
  for the consented tier, because order attribution needs consent. Order and
  revenue totals don't: ADR 0012's anonymous backup counts the rest.
- **More code paths.** Each surface's client needs the two modes, and a
  switch between them when the shopper accepts (with the reset above).
  Device properties are dropped in the exempt tier, so its reports can't be
  split by browser or screen size. #93, #107 and #108 need
  changing (follow-up ticket).
- **The banner gets a little longer:** a sentence about usage statistics and
  an off switch, next to the existing Accept / Decline.
- **Copy and the legitimate interests assessment** have to be written before
  the exempt tier goes live.
- ⚠️ This record reads the statute and the ICO's guidance; it is not legal
  advice. The order-attribution boundary in particular is a judgement call,
  made on the cautious side.

## Revisit when

- The ICO publishes enforcement or further guidance on analytics under
  paragraph 5.
- PostHog's terms or EU processing change.
- Shopify's Customer Privacy API is adopted through Hydrogen (SHO-170). Its
  consent categories would then need mapping onto these two tiers.

## Sources

- [Data (Use and Access) Act 2025, Schedule 12](https://www.legislation.gov.uk/ukpga/2025/18/schedule/12)
  (s.112, inserting PECR Schedule A1)
- [ICO, _Guidance on the use of storage and access technologies_](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/),
  "What are the exceptions?" (finalised 29 April 2026)
