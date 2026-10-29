# Campaigns

How a time-boxed promotion, such as Black Friday, is defined once in Shopify
and shown the same way on the theme, web and the app.

The first campaign is **Black Friday 2026: Friday 27 November to Monday
30 November**. It's the demo campaign.

## The model

One **Campaign** metaobject (`campaign`) holds everything a surface needs.
Products point to it, not the other way round.

```text
Campaign ◄──── product.double_helix.campaign        (one campaign per product)
   ▲     ◄──── variant.double_helix.campaign        (optional: only these variants)
   │
   └── collection ──► smart collection: product.double_helix.campaign = this campaign
```

### Campaign fields

| Key               | Type             | Required | Notes                                                              |
| ----------------- | ---------------- | -------- | ------------------------------------------------------------------ |
| `title`           | single line text | yes      | Display name in admin                                              |
| `starts_at`       | date and time    | yes      | Surfaces show nothing before this                                  |
| `ends_at`         | date and time    | yes      | A real end time. Any countdown or "ends soon" copy must match it   |
| `badge`           | single line text | yes      | The label on product cards, e.g. "Black Friday"                    |
| `headline`        | single line text |          | Landing page and app screen heading                                |
| `banner_text`     | single line text |          | The site-wide banner                                               |
| `offer`           | single line text | yes      | What shoppers get, worded as shown, e.g. "25% off one-time orders" |
| `discount_code`   | single line text |          | Empty for an automatic discount                                    |
| `subscriber_perk` | single line text |          | What subscribers get instead of the sale discount                  |
| `image`           | image            |          | Banner and landing hero                                            |
| `body`            | rich text        |          | Landing page copy                                                  |
| `terms`           | multi-line text  | yes      | Shown on the landing page                                          |
| `collection`      | collection       |          | The products on the landing page                                   |

The definition is **publishable** (draft or active) and **readable by the
Storefront API**. Online Store pages for it are off until the theme has a
`metaobject/campaign` template; then they're switched on with the URL handle
`campaigns`, giving `/pages/campaigns/<handle>` (see [URLs](#urls)).

### Why products point to the campaign

- **The product page already has the answer.** Web, the app and the theme read
  the product, and the campaign comes with it: no second request to find out
  whether a product is on offer.
- **A variant field narrows it.** If any variant of a product has its own
  `campaign` set, only those variants show the badge. That allows "the 90-day
  plan only" without a second campaign.
- **One campaign per product at a time.** A list field would allow overlaps,
  but Shopify's smart collections only accept a single metaobject reference.
  Overlapping campaigns are a pricing headache anyway.

### The product list keeps itself in step

The landing page needs "every product in this campaign", and a product field
can't be searched in reverse cheaply. So each campaign gets a **smart
collection** with the rule `Campaign equals <this campaign>`, and the campaign's
`collection` field points to it. Tag a product with the campaign and it joins
the landing page; nothing is kept in two places.

## Dates are enforced in code

Metaobjects don't switch themselves off. Every surface treats a campaign as
active only when it's published **and** `starts_at <= now < ends_at`. One
shared function in `packages/shopify` decides that, so the three surfaces can't
disagree.

Cached pages must not outlive the campaign:

- **Web:** pages that show campaign content revalidate at `starts_at` and
  `ends_at` at the latest (a revalidate time worked out from the dates), not
  on the usual hour.
- **App:** TanStack Query refetches on focus; the shared function is checked
  at render, so a stale campaign hides itself.
- **Theme:** Liquid compares the dates on each render; Shopify's page cache
  follows metaobject changes.

## The offer

**Step one: a plain Shopify discount.** An automatic discount (or a code in
`discount_code`) on one-time purchases of the campaign's collection, with an
end date that matches `ends_at`. Shopify enforces it at checkout; the
surfaces only describe it with `offer`.

**Step two: a discount Function** that reads the campaign itself, so the price
charged and the badge come from one record. Later, once step one is live.

### Subscribers get a perk, not the sale price

Subscriptions are already 15% off. Stacking a sale on top cuts the margin
deeply, and a sale only for one-time orders makes subscribers feel overcharged
and tempts them to cancel and rebuy at the sale price. So:

- the discount applies to **one-time purchases only**;
- subscribers get `subscriber_perk` instead, for example a free shaker with
  their next delivery;
- the perk is fulfilled by adding it to their next Recharge order, which is a
  later step. For the demo, the perk is described, not automated.

## On each surface

|               | Theme                                                               | Web                                                            | App                                               |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Banner        | Header section reading the active campaign                          | Banner in the layout                                           | Banner on home                                    |
| Product badge | Card and product page                                               | Card and product page                                          | Product row and product screen                    |
| Landing page  | `metaobject/campaign` template                                      | `/pages/campaigns/<handle>`                                    | A native campaign screen, opened by the same path |
| Prices        | "Was/now" only for a genuine price; otherwise "25% off at checkout" | The same                                                       | The same                                          |
| Cart          | Shows the discount applied (already does)                           | The same                                                       | The same                                          |
| Sharing       | Theme meta tags                                                     | Metadata, share image, offer structured data with its end date | n/a                                               |

### URLs

The landing page has the same path on the theme and web, and the app's link
handling opens it in the campaign screen. The route-parity test covers it.

## Rules that must hold

- **Honest urgency** (Digital Markets, Competition and Consumers Act 2024): a
  countdown matches `ends_at`; no invented low-stock messages.
- **Genuine "was" prices** (CMA pricing guidance): show a strikethrough only
  against a price the product really sold at.
- **Authorised health claims only**, including in campaign copy.
- **The demo-store notice stays visible**, campaign or not.

## Around it

- **Email:** a Klaviyo campaign, drafted only until approved: an early-access
  send, the launch, and a last-chance reminder, with anyone who has already
  bought removed. A subscriber version describes the perk.
- **Measurement:** campaign tagged on PostHog events and UTMs; a 10% holdout
  from email, so January can show what the sale added rather than moved
  forward.
- **Cost:** a traffic spike counts against Vercel's free CDN allowance.
  Hero images go through Shopify's CDN at the right sizes.

## Checking a campaign before it starts

Each surface can be shown a different "now", outside production only:

- **Web:** `CAMPAIGN_PREVIEW_AT=2026-11-28T12:00:00Z` (ignored when
  `VERCEL_ENV` is `production`).
- **Theme:** the "Campaign preview time" theme setting, on an unpublished
  theme. Leave it empty on the live theme.
- **App:** `EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT`, honoured in development builds
  only.

## Where it lives

- `packages/shopify/src/campaign.ts`: the rules (dates, the variant rule, the
  labels), with tests. `queries.ts` has `CampaignFields`, `CampaignsQuery` and
  `CampaignByHandleQuery`.
- Theme: `snippets/campaign-status.liquid` applies the same rules in Liquid;
  `campaign-banner`, `campaign-badge`, `campaign-offer` and the
  `metaobject/campaign` template use it. The collections list hides a
  campaign's collection outside its dates.
