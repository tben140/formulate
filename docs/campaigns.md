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

| Key                      | Type              | Required | Notes                                                                                                   |
| ------------------------ | ----------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `title`                  | single line text  | yes      | Display name in admin                                                                                   |
| `starts_at`              | date and time     | yes      | Regular start; early access (email link) can begin sooner                                               |
| `ends_at`                | date and time     | yes      | A real end time. Any countdown or "ends soon" copy must match it                                        |
| `badge`                  | single line text  | yes      | The label on product cards, e.g. "Black Friday"                                                         |
| `headline`               | single line text  |          | Landing page and app screen heading                                                                     |
| `banner_text`            | single line text  |          | The site-wide banner                                                                                    |
| `offer`                  | single line text  | yes      | What shoppers get, worded as shown, e.g. "25% off one-time orders"                                      |
| `discount_code`          | single line text  |          | Empty for an automatic discount                                                                         |
| `subscriber_perk`        | single line text  |          | What subscribers get instead of the sale discount                                                       |
| `image`                  | image             |          | Banner and landing hero                                                                                 |
| `body`                   | rich text         |          | Landing page copy                                                                                       |
| `terms`                  | multi-line text   | yes      | Shown on the landing page                                                                               |
| `collection`             | collection        |          | The products on the landing page                                                                        |
| `offer_rules`            | JSON              |          | The offer as data: see [Offer rules](#offer-rules)                                                      |
| `early_access_starts_at` | date and time     |          | Earlier start for email-link visitors: see [Early access](#early-access)                                |
| `perk_variant`           | variant reference |          | The subscriber perk's product: see [Subscribers get a perk](#subscribers-get-a-perk-not-the-sale-price) |

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
- `appliesTo`: `"one_time"` (the default; see below), `"all"`, or
  `"subscriptions"`, a **subscribe-first** offer: the subscription options
  show the campaign price off the subscription price, and Recharge's renewals
  don't pass through checkout, so it's the first delivery only. The older
  `"oneTimeOnly": false` still means `"all"`.
- Rules that don't parse are ignored: the surfaces show `offer` alone, never a
  guessed price. `campaigns check` reports them.
- Variant narrowing works with `percent` only: tiers and bundles count every
  item of a product in the campaign.

**Limits and audiences** (all optional; only the campaign Function enforces
them, so `check` fails a plain Shopify discount for an offer that has them):

```text
{ "type": "percent", "percent": 25, "maxUnits": 2, "oncePerCustomer": true }
{ "type": "percent", "percent": 30, "audienceTags": ["lapsed-subscriber"] }
```

- `maxUnits`: at most this many of each product at the campaign price per
  order; past it, the rest are full price. Stops a reseller clearing stock.
- `oncePerCustomer`: a signed-in customer who's had the offer doesn't again.
  They're marked with the tag `campaign:<handle>`: run
  `campaigns tag-buyers <handle> --apply` during the campaign, or, so it's
  instant, a Shopify Flow ("Order created → discount is the campaign's → add
  customer tag `campaign:<handle>`").
- `audienceTags`: only signed-in customers with one of these tags, such as a
  **win-back** offer for lapsed subscribers:
  `campaigns audience lapsed --tag lapsed-subscriber --within 180 --apply`
  tags every customer whose subscriptions are all cancelled, the last within
  180 days (from Recharge). Such an offer must be `audience: email_link`, so
  nobody else is shown an offer they can't have; `check` enforces it.
- Guests can't be told apart at checkout: they're never limited and never in
  an audience. Say "per signed-in customer" in the terms; `check` warns when
  the terms don't mention a limit. The product page shows the limits under
  the offer ("Black Friday price on up to 2 of each product, once per
  customer (signed in)").

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
- the perk is added to their next Recharge delivery after the campaign by
  `pnpm campaigns perks <handle>`: one free item (`perk_variant`, £0.00) per
  active subscription, dated its next charge so it ships in the same box.
  Without `--apply` it only lists what it would add. Each is marked
  `_campaign_perk = <campaign>:<subscription>`, so running it again (for
  subscriptions whose next charge was still during the campaign) never adds
  one twice. `check` warns when the perk is described but has no
  `perk_variant`.

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

## Early access

Set `early_access_starts_at` before `starts_at`, and people who came through
the campaign's email link see it live from then, on web and the app (the
theme, which can't tell who came through the link, waits for `starts_at`).

- **The discount:** a code discount (single-use codes in a Klaviyo coupon)
  starting at the early time. The email links to
  `/discount/<code>?redirect=/pages/campaigns/<handle>`, which grants access.
- **The email:** `campaigns emails` plans an "early access" draft for that time.
- **`check`** errors when no code discount starts at the early time, so
  nobody sees an offer they can't get.

## Attribution

A visit to a live campaign page tags the cart `_campaign=<handle>` (web, the
app and the theme; underscore attributes are hidden at checkout), and an add
to cart within a week tags it too. The last campaign seen wins. The order
keeps the tag, so `campaigns report` counts orders that came from the
campaign even without its discount, for example a tiered offer just missed.

## The campaigns CLI

`pnpm campaigns <command>` (packages/campaigns) runs a campaign from the record:

| Command                                               | What it does                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar`                                            | Every campaign by date: upcoming, live, ended, draft. Flags overlaps, ended ones to delete, and the theme's 50 limit                                |
| `check <handle>`                                      | Everything that must agree before go-live (below). Exits 1 on an error                                                                              |
| `new <template> <handle> --starts <ISO> --ends <ISO>` | A draft campaign from `black-friday`, `january-reset` (tiered) or `summer` (3 for 2), with its smart collection                                     |
| `sync <handle> [--activate]`                          | Creates or updates the campaign's discount on the campaign Function, with the record's dates and rules. New ones start switched off                 |
| `emails <handle> [--create]`                          | The launch and last-day emails, timed from the dates; `--create` makes them Klaviyo drafts (never scheduled)                                        |
| `pushes <handle> [--create]`                          | Launch and last-day pushes, opening the campaign screen; `--create` makes Klaviyo drafts for `KLAVIYO_PUSH_SEGMENT_ID` (needs push set up: SHO-165) |
| `approve <handle> --by <name>`                        | Signs the campaign off; `check` fails until it's approved, and again after any later edit                                                           |
| `history [<handle>]`                                  | The change log: every edit to a campaign record, what changed and when (below)                                                                      |
| `flows <handle> [--create]`                           | The last-day abandoned-checkout email as a draft Klaviyo flow (below)                                                                               |
| `report <handle>`                                     | Orders, revenue, discount cost, first orders, subscriptions started, by surface and email source, top products                                      |
| `codes <handle> --count <n> [--prefix BF] [--apply]`  | Personal single-use codes: a code discount on the campaign Function and a Klaviyo coupon with the same codes (below)                                |
| `prices record [--apply]`                             | Today's price for every variant into its price history (below). Run daily by `.github/workflows/price-history.yml`                                  |

**What `check` compares:** the record parses as the surfaces read it; every
percentage in the copy is one the offer gives (or the 15% subscribe and save);
the collection is the "Campaign equals" smart collection and has products,
active and on the Online Store; variant narrowing only with a percent offer;
exactly one discount, starting and ending with the campaign, at the offer's
percentage, one-time only if the offer is, on the collection, a code for
email-link campaigns, or a Function config in step with the record; and,
with a Klaviyo key, the emails send before the end and say the right
percentage. And the prices, below.

### Sign-off and the change log

**Sign-off.** `campaigns approve <handle> --by Ben` writes `approved_by` and
`approved_at` on the record. `check` fails a campaign nobody has approved, and
one edited since its approval (Shopify's `updatedAt`, two minutes' grace for
the approval's own save), so a late typo in the terms can't go live unseen.

**Change log.** Shopify sends every create, edit and delete of a campaign
record to the Worker (`apps/api/src/campaign-log.ts`, subscribed in
`shopify.app.toml`), signed with the app's client secret. The Worker keeps
each campaign's last fields and logs what changed, and when; Shopify doesn't
say who, which is what the sign-off is for. `campaigns history [<handle>]`
reads it:

```text
2026-11-26T16:02:11Z  update  black-friday-2026
    terms: 25% off one-time purchases of the products… → 25% off one-time purchases, until…
```

Setting it up (Ben): `wrangler secret put SHOPIFY_APP_CLIENT_SECRET` and
`wrangler secret put CAMPAIGN_LOG_TOKEN` (any long random string) on the
Worker, `CAMPAIGN_LOG_TOKEN` in `~/.config/formulate/shopify-app.env` too, then
deploy the Worker and `shopify app deploy`. Edits before that aren't logged.

### Ends tonight: the abandoned checkout

`campaigns flows <handle> --create` makes a Klaviyo flow of its own, as a
draft: anyone who starts a checkout holding the campaign's products (Shopify's
"Checkout Started", filtered on its `Collections`) and hasn't ordered an hour
later gets "Your Black Friday basket is saved: the offer ends at midnight",
once. A flow of its own rather than a branch of the live abandoned-cart flow,
so nothing live changes. **Switch it on at the start of the last day and off
at the end**; it has no dates of its own. Add the email's body in Klaviyo
(the last-day campaign's template fits) and it sends from the account's
default sender. Black Friday 2026's is `VwNnXJ` (draft).

### Terms from the rules

`campaigns terms <handle>` writes the terms from `offer_rules`: the dates in
UK time, the offer and what it reaches, limits, audience, what it won't
combine with, the subscriber perk as `campaigns perks` gives it, and the
demo-store note. `--apply` saves them (then approve again). `check` warns
when the saved terms say something else, so an edit to either side shows.

### Stock

`check` reads each variant's stock (where Shopify tracks it) and warns about
anything sold out or under 10 (`--min-stock`) before launch. During the
campaign its page lists buyable products first and sold-out ones last, on
every surface (`availableFirst`). The home hero shows the campaign's own
image, never a product, so it can't feature something sold out.

### Personal codes

A shared code ends up on voucher sites within hours. For a code campaign,
`campaigns codes <handle> --count 5000 --apply` makes one code per recipient
(`BF-7KQ2MZ9P`: eight characters, no 0/O or 1/I/L, from a cryptographic
source), on a second code discount on the campaign Function, titled
"<title> (personal codes)", its config marked `pool: "personal"`, set to one
use per code and once per customer, starting switched off like `sync`'s. With
`KLAVIYO_PRIVATE_KEY` the same codes go to a Klaviyo coupon named after the
handle (`BLACK_FRIDAY_2026`), and the email gives each person one with
`{% coupon_code 'BLACK_FRIDAY_2026' %}`. Run it again to add more; `check`
holds the pool to the same config and dates as the main discount.

⚠️ Shopify documents `usageLimit` as "the number of times the discount can be
redeemed", not per code. Before the codes go out, make one test order with a
code on the development store and try the same code again: it must be
refused, while a second code still works. If the limit turns out to be for
the whole discount, remove it in the admin and rely on once per customer.

### Prices and margins

**An honest "Normally".** The surfaces strike through the product's current
price. UK pricing rules expect that to be a price the product was genuinely
sold at, for a reasonable time, recently: the CMA treats a price raised just
before a sale as misleading. Shopify keeps no price history, so
`campaigns prices record` keeps one, as each variant's price changes in an
app-owned metafield (`$app:campaigns.price_history`), written only when the
price moves. `check` fails a campaign when any variant's price was lower at
any point in the 28 days before the start, and warns while the history is
shorter than 28 days. The workflow needs the repository secrets
`SHOPIFY_STORE_DOMAIN` and `SHOPIFY_APP_CLIENT_SECRET`; until they're set it
skips, and so the history only starts from the first run.

**Margins.** `check` takes each variant's worst price under the offer (the
highest tier; a bundle's free units spread across the set; subscribe and
save's 15% first if the offer reaches subscriptions) against its unit cost in
Shopify (Products → variant → Cost per item; read with `read_inventory`). Below
cost is an error; under the floor (30%, or `--min-margin`) a warning. A
variant with no cost set is listed, as its margin can't be checked.

**Signing in.** The CLI signs in as the Double Helix app (client credentials,
a token for the run, never stored or printed), because only the app can make
discounts on its Function. It reads `SHOPIFY_STORE_DOMAIN`,
`SHOPIFY_APP_CLIENT_SECRET` and optionally `KLAVIYO_PRIVATE_KEY` from the
environment or `~/.config/formulate/shopify-app.env`. The secret comes from the
Dev Dashboard and stays on Ben's machine. The app's scopes are in
`apps/shopify-app/shopify.app.toml`; `shopify app deploy` asks the store to
grant them.

**Dashboard.** `campaigns report <handle> --html results.html --watch 10`
rewrites a one-page dashboard every 10 minutes through the campaign: orders,
revenue, discount given, average order, first orders, subscriptions started,
orders by UK hour, by surface, by source, and the top products. One file, no
scripts or outside requests, store text escaped; keep it open, or publish it
privately.

**Did buyers come back?** `campaigns cohort <handle>` follows the campaign's
signed-in buyers for 30, 60 and 90 days after it ended: how many ordered
again (a Recharge renewal is an order, so it counts), how many have a
subscription, and how many haven't been back; windows not over yet say "so
far". Guest orders can't be followed and are counted apart. Run it in
January for Black Friday, and again in March.

**Attribution.** The report counts an order when the campaign's discount was
applied or the cart was tagged `_campaign` by a visit to the campaign page. By
surface it uses `_surface` when present (the PostHog stack adds it), else
Shopify's source.

## Offer experiments (designed; waits for #93)

Testing two offers against each other (20% off against spend-and-save, say)
needs PostHog's feature flags, which arrive with #93. The design, so it's
quick to build once that lands:

1. **The record** gets `offer_variants`: JSON naming each arm and its rules,
   `{ "control": <offer_rules>, "tiered": { "type": "tiered", … } }`, plus
   its own wording per arm (`offer`, `banner_text`). `check` holds every arm
   to the same rules as `offer_rules` (wording, margins, price history).
2. **Assignment** is PostHog's flag `campaign-<handle>`, evaluated once per
   visitor: on the server for web (so the first paint is already right), by
   the SDK in the app, and in the theme's script after consent. Without
   consent, or if PostHog fails, everyone gets `control`.
3. **Checkout** can't see the flag, so the surfaces tag the cart with the arm
   (`_offer_arm`, beside `_campaign`), and the campaign Function reads it
   (`cart.attribute(key: "_offer_arm")`) and charges that arm's rules. An
   untagged cart gets `control`. A shopper only ever sees, and pays, their
   own arm's price.
4. **Results:** `campaigns report` splits by `_offer_arm`: orders, revenue,
   discount given and margin per visitor in each arm, with PostHog's
   experiment view for conversion.

Rules that hold: an arm never shows a price it won't charge; nobody's arm
changes mid-campaign (the flag is sticky per visitor, and the cart carries
it); and every arm's terms are on the campaign page, so shoppers comparing
notes see why they differ.

## Housekeeping

Once a campaign has ended, `campaigns tidy <handle> --apply` takes it off its
products and variants, deletes its collection and sets the record back to
draft: kept for `report` and `history`, shown nowhere. It refuses while the
campaign is still running. Expired discounts are left; they do nothing. Until
then, the campaign page says the offer has ended and points to the email
sign-up ("Want the next offer first?") on every surface.

Tidy ended campaigns: the theme's banner and collections list read the first
50 campaigns only, a Liquid limit, so a long tail of old ones could hide a
live one.

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
