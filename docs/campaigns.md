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
| `offer_rules`     | JSON             |          | The offer as data: see [Offer rules](#offer-rules)                 |

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

- **Web:** pages render per request (the campaign view reads cookies), so
  there's nothing to revalidate; the list of campaigns is cached for a minute,
  shared by every visitor. A tab left open refreshes itself at the next start
  or end time, since the layout isn't re-rendered on client-side navigation.
- **App:** TanStack Query refetches every five minutes at most; the shared
  function is checked at render, and the app re-renders at the next start or
  end time, so banners, badges and offers change together.
- **Theme:** Liquid compares the dates on each render; Shopify's page cache
  follows metaobject changes.

## The offer

**Step one: a plain Shopify discount.** An automatic discount (or a code in
`discount_code`) on one-time purchases of the campaign's collection, with an
end date that matches `ends_at`. Shopify enforces it at checkout; the
surfaces only describe it with `offer`.

**Step two: a discount Function** that reads the campaign itself, so the price
charged and the badge come from one record. Later, once step one is live.

### Offer rules

`offer` is the wording; `offer_rules` is the same offer as data, so the
surfaces can show it before checkout and the discount Function can charge it.
One of:

```text
{ "type": "percent", "percent": 25 }
{ "type": "tiered", "tiers": [{ "minSubtotal": "40.00", "percent": 15 }, { "minSubtotal": "60.00", "percent": 25 }] }
{ "type": "bundle", "buy": 3, "free": 1 }
```

- Percentages are whole numbers from 1 to 90. Tiers go up in both threshold
  and percentage; `currencyCode` defaults to `GBP`. A bundle gives the
  cheapest `free` of every `buy` items free ("3 for 2" is buy 3, free 1).
- Add `"oneTimeOnly": false` to include subscriptions; the default leaves
  them out (see below).
- Rules that don't parse are ignored: the surfaces show `offer` alone, never a
  guessed price. `campaigns check` reports them.
- Variant narrowing works with `percent` only: tiers and bundles count every
  item of a product in the campaign.

What each surface does with them, from `packages/shopify/src/campaign-offer.ts`
(the theme repeats the rules in `campaign-offer-cents`, `campaign-covers` and
`campaign-cart-hint`):

| Rule      | Product cards and purchase options                | Cart                                                  |
| --------- | ------------------------------------------------- | ----------------------------------------------------- |
| `percent` | The campaign price beside the struck normal price | Shopify's discounted line prices                      |
| `tiered`  | The `offer` text                                  | "Spend £12.00 more on Black Friday items for 25% off" |
| `bundle`  | The `offer` text                                  | "Add 1 item from Black Friday for 1 more free"        |

The struck price is the price the item sells at outside the campaign, so it's
a genuine comparison (CMA pricing guidance); screen readers hear "Normally
£24.95, Black Friday price £18.71". It's rounded to the penny per item, as
Shopify rounds a percentage; a line of several can differ by a penny at
checkout, which shows the exact total.

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

|               | Theme                                                      | Web                                                            | App                                               |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Banner        | Header section reading the active campaign                 | Banner in the layout                                           | Banner on home                                    |
| Product badge | Card and product page                                      | Card and product page                                          | Product row and product screen                    |
| Landing page  | `metaobject/campaign` template                             | `/pages/campaigns/<handle>`                                    | A native campaign screen, opened by the same path |
| Prices        | Campaign price beside the normal one for a `percent` offer | The same                                                       | The same                                          |
| Countdown     | "Ends in 5h 12m" in the last day, from `ends_at`           | The same                                                       | The same                                          |
| Cart          | Shows the discount applied (already does)                  | The same                                                       | The same                                          |
| Sharing       | Theme meta tags                                            | Metadata, share image, offer structured data with its end date | n/a                                               |

### URLs

The landing page has the same path on the theme and web, and the app's link
handling opens it in the campaign screen. The route-parity test covers it.

## Rules that must hold

- **Honest urgency** (Digital Markets, Competition and Consumers Act 2024): the
  countdown runs to `ends_at` and only in the last day; no invented low-stock
  messages. The theme counts by the browser's clock, since its pages are
  cached.
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
- **Cost:** web pages are rendered per request, so a traffic spike costs
  function time as well as counting against Vercel's free CDN allowance. Hero
  images go through Shopify's CDN at the right sizes.

## Previewing a campaign

Before a campaign starts, or for one only emails can reach, open its preview
link. It shows the whole surface as if that campaign were live, for you only,
with a "Previewing … Stop preview" strip. Only what's shown changes: Shopify
still applies the discount on its own dates.

| Surface | How                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web     | `https://<site>/pages/campaigns/<handle>/preview?token=<CAMPAIGN_PREVIEW_TOKEN>`. Lasts a day in that browser, or until Stop.                    |
| App     | `formulate://pages/campaigns/<handle>?preview=<token>` (Expo Go: `exp://<host>/--/pages/campaigns/<handle>?preview=<token>`). Lasts the session. |
| Theme   | An unpublished copy of the theme with "Campaign preview time" set (theme settings → Campaigns), opened with its Preview link.                    |

`CAMPAIGN_PREVIEW_TOKEN` is a long random secret set **in Vercel only**. The
app sends the token to the web site's `/api/campaign-preview` to check it, so
the secret is never in the app's bundle. A wrong token gets a plain 404. On
web, the preview cookie is signed with the same secret, so it can't be set
by hand; changing the secret ends every preview.

For local checks, `CAMPAIGN_PREVIEW_AT` (web) and
`EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT` (app, development builds) move the clock
instead. Both are ignored in production.

## Offers only for people with an email link

Set the campaign's **Audience** to `email_link`. Then:

1. **Make the codes single-use, one per person.** A Shopify discount with
   unique codes, loaded into a Klaviyo coupon, as the welcome flow does. A
   shared code ends up on deal sites; a single-use one can't spread.
2. **Link to** `https://<site>/discount/<code>?redirect=/pages/campaigns/<handle>`
   in the email (Klaviyo fills `<code>` per person).
3. **The link puts the code on the cart** and opens the campaign page. Web and
   the app handle `/discount/<code>` themselves; the theme uses Shopify's own.
4. **Only people who came through the link see it.** Web remembers that in a
   cookie for 30 days, the app on the device. Everyone else gets no banner or
   badges, and the page says the offer is for email subscribers. Liquid can't
   tell who came through the link, so the theme never advertises an email-only
   campaign; its page shows to anyone with the URL, kept out of search, and
   the code remains the gate.

Shopify decides whether a code is valid, at checkout. A wrong code still
opens the page; the cart simply shows no discount.

## Housekeeping

Delete a campaign's entry (and its collection and discount) once it has
ended. The theme's banner and collections list read the first 50 campaigns
only, a Liquid limit, so a long tail of old ones could hide a live one.

## Moving the clock (local checks)

See "Previewing a campaign" above.

## Where it lives

- `packages/shopify/src/campaign.ts`: the rules (dates, the variant rule, the
  labels), with tests. `queries.ts` has `CampaignFields`, `CampaignsQuery` and
  `CampaignByHandleQuery`.
- Theme: `snippets/campaign-status.liquid` applies the same rules in Liquid;
  `campaign-banner`, `campaign-badge`, `campaign-offer` and the
  `metaobject/campaign` template use it. The collections list hides a
  campaign's collection outside its dates.
