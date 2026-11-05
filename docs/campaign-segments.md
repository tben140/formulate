# Campaign segments: an offer per customer segment (design)

SHO-207 (offers per segment) and SHO-208 (Klaviyo segment sync), designed together because they share one idea: **a segment is defined once, and both checkout and Klaviyo use that definition.** This is the design for review; the build follows Ben's answers to the questions at the end.

## What it's for

One campaign, a different offer for different people. For Black Friday, for example:

- active subscribers get the shaker, as now;
- lapsed subscribers get a win-back discount;
- one-time buyers get a subscribe-first offer;
- everyone else gets the public 25%.

## The constraint that shapes everything

**Shopify only knows who a shopper is at checkout if they're signed in, or they arrive with a code.** A discount Function can read a signed-in customer's tags; it can't see anything about a guest. So every segment offer needs a **delivery route**:

| Route        | How the shopper gets it                                                  | Built                 |
| ------------ | ------------------------------------------------------------------------ | --------------------- |
| `sign_in`    | The Function checks the customer's `segment:<key>` tag (`audienceTags`)  | Function side in #205 |
| `email_link` | The link in the segment's email opens the offer (`audience: email_link`) | #188                  |
| `codes`      | A personal single-use code per member, sent by email                     | #208                  |

Guests who don't come through a link or code see the **public** offer only. The terms say "signed in" where it applies; `campaigns check` already insists on that.

## Segments

| Key            | Who                                                      | Source                                           | Needs protected customer data |
| -------------- | -------------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| `active`       | An active Recharge subscription                          | Recharge API                                     | no                            |
| `lapsed`       | Cancelled in the last 12 months, no active subscription  | Recharge API (`campaigns audience lapsed`, #206) | no                            |
| `at_risk`      | 2+ skipped or failed deliveries in 90 days, still active | Recharge charges                                 | no                            |
| `one_time`     | Ordered, never subscribed                                | Shopify orders minus Recharge customers          | **yes**                       |
| `dormant`      | Last order 90–180 days ago                               | Shopify orders                                   | **yes**                       |
| `best`         | Top 10% by spend, or subscribed 12+ months               | Shopify `amountSpent`, Recharge                  | **yes** (spend)               |
| `never_bought` | Email subscriber or account with no order                | Klaviyo ("Placed Order zero times")              | no (Klaviyo-side)             |
| `app`          | Used the app in the last 90 days                         | Klaviyo app events (waits for #107)              | no                            |

Three segments read Shopify customer data. The app already has it: as a custom-distribution app it reads customers, emails included (checked on 3 Nov), so no protected customer data request is needed.

## Settings

Thresholds live on the **Campaign settings** record (metaobject type `campaign_config`, handle `settings`, admin only), so they change without a release:

| Field                | Holds                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segment_thresholds` | JSON overrides: `lapsedMonths` (12), `atRiskMisses` (2), `atRiskDays` (90), `dormantFromDays` (90), `dormantToDays` (180), `bestTopPercent` (10), `bestSubscribedMonths` (12). A missing or bad key keeps its default, and the CLI says which. |
| `segment_counts`     | Written by `campaigns segments --apply`: each segment's size and when it was counted. The calendar shows it.                                                                                                                                   |

(The type is `campaign_config` because Shopify reserves `campaign_settings`.)

## How membership is kept

A nightly job, `pnpm campaigns segments sync [--apply]`, run by a scheduled workflow like price history:

1. Works out each segment's members from the sources above, as Shopify customer IDs. Recharge gives `external_customer_id` without a Shopify lookup.
2. **In Shopify:** adds `segment:<key>` to members, and removes it from people who've left. Uses `tagsAdd` and `tagsRemove`, in batches. This is the tag the Function's `audienceTags` reads.
3. **In Klaviyo (SHO-208):** keeps a static list per segment ("Segment: lapsed") in step, by Shopify customer email. These are **lists, not segments**, so membership is exactly the job's, never Klaviyo's own logic. Nothing is sent: list membership is data. Emails to a list stay drafts until Ben approves them, as always.
4. Plans unless `--apply`, like every other command. The calendar shows each segment's count and when it was last synced.

## Offers per segment

The campaign record gains an optional **`offers`** JSON field next to `offer_rules`:

```json
[
  {
    "segment": "lapsed",
    "delivery": "sign_in",
    "rules": { "type": "percent", "percent": 30 }
  },
  {
    "segment": "one_time",
    "delivery": "codes",
    "rules": { "type": "percent", "percent": 20, "appliesTo": "subscriptions" }
  }
]
```

- **Validated by the same parser** as `offer_rules` (`parseOfferRules`), plus a known segment and delivery.
- **Sync** makes one Function discount per segment offer, with `audienceTags: ["segment:<key>"]`, alongside the public discount. Discounts don't combine, so a shopper in a segment gets the better of their offer and the public one; Shopify picks the larger.
- **Terms:** a sentence per segment offer ("Lapsed subscribers, signed in: 30% off one-time purchases").
- **Check:**
  - every segment offer parses;
  - its segment has members;
  - its delivery route exists (codes made, an email drafted);
  - the margin floor holds for the deepest offer.
- **The calendar's offer editor (#228)** gets a tab per segment, with the same side-by-side preview.
- **Surfaces:** a signed-in shopper sees their segment's offer on the campaign page and product pages. This needs their tags, which the storefront can't read with the public Storefront token. It goes through the Customer Account API session (#76), so it lands after sign-in does. Until then, segment offers are told by email and applied at checkout.

## Order of work

1. **Built (#235):** the `segments` module with every segment above except `never_bought` and `app`; `pnpm campaigns segments` shows sizes and the tags a sync would add and remove, and `--apply` stores the counts. `.github/workflows/segment-counts.yml` runs it nightly once the `RECHARGE_API_TOKEN` repository secret is set (it skips with a notice until then). **It writes no tags yet;** Ben approved tag writes on 5 Nov (Decisions, 2), so they come next.
2. **With Ben's OK on Klaviyo lists:** the Klaviyo half of the sync.
3. **`offers`:** the field, sync, terms, check and editor tabs.
4. ~~After protected customer data~~ `one_time`, `dormant`, `best`: built with step 1, since the app already reads customer data.
5. **After sign-in (#76) and app events (#107):** showing segment offers on site, and the `app` segment.

## Decisions (Ben, 5 Nov 2026)

1. **Klaviyo lists:** yes. The nightly job may create and update one static list per segment (`Segment: <key>`). It never sends; emails stay drafts until approved.
2. **Shopify tags:** yes. The nightly job may add and remove `segment:<key>` tags on customers.
3. **Protected customer data:** not needed; the app already reads customers.
4. **First segments:** `lapsed` (win-back) and `at_risk` (a "keep your plan" perk, not a discount).
5. **Thresholds:** 12 months for lapsed, 90–180 days for dormant, top 10% for best, adjustable on the Campaign settings record.
