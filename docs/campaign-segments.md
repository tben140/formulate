# Campaign segments: an offer per customer segment (design)

SHO-207 (offers per segment) and SHO-208 (Klaviyo segment sync), designed together because they share one idea: **a segment is defined once, and both checkout and Klaviyo use that definition.** This is the design for review; Ben's decisions are at the end.

## What it's for

One campaign, a different offer for different people. For Black Friday, for example:

- active subscribers get the shaker, as now;
- lapsed subscribers get a win-back discount;
- one-time buyers get a subscribe-first offer;
- everyone else gets the public 25%.

## The constraint that shapes everything

**Shopify only knows who a shopper is at checkout if they're signed in, or they arrive with a code.** A discount Function can read a signed-in customer's tags; it can't see anything about a guest. So every segment offer needs a **delivery route**:

| Route        | How the shopper gets it                                                                                    | Gate                     | Built                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| `sign_in`    | A Function discount that only applies to customers tagged `segment:<key>` (`audienceTags`)                 | the tag: signed in only  | Function side in #205 |
| `email_link` | A personal single-use code per member, put on the cart by the email's `/discount/<code>` link (as in #188) | the code: guests qualify | #188                  |
| `codes`      | The same personal single-use codes, sent for typing at checkout                                            | the code: guests qualify | #208                  |

**`audienceTags` is only for `sign_in`.** A guest can never meet a tag gate, so `email_link` and `codes` offers carry no tags: the single-use code is the gate. Guests who don't come through a link or code get the **public** offer only.

**Segment offers are never advertised to everyone.** The public offer is what the banner, badges and campaign page show. A segment offer is told by its email, and shown on site only to a signed-in member once sign-in lands (#76). So `campaigns check`'s rule that a tag-gated offer be `audience: email_link` applies to the campaign's own `offer_rules`, not to `offers`; check enforces instead that no segment offer is shown on public surfaces. The terms say "signed in" for `sign_in` offers.

## Segments

| Key            | Who                                                      | Source                                           | Members are       |
| -------------- | -------------------------------------------------------- | ------------------------------------------------ | ----------------- |
| `active`       | An active Recharge subscription                          | Recharge API                                     | Shopify customers |
| `lapsed`       | Cancelled in the last 12 months, no active subscription  | Recharge API (`campaigns audience lapsed`, #206) | Shopify customers |
| `at_risk`      | 2+ skipped or failed deliveries in 90 days, still active | Recharge charges                                 | Shopify customers |
| `one_time`     | Ordered, never subscribed                                | Shopify orders minus Recharge customers          | Shopify customers |
| `dormant`      | Last order 90–180 days ago                               | Shopify orders                                   | Shopify customers |
| `best`         | Top 10% by spend, or subscribed 12+ months               | Shopify `amountSpent`, Recharge                  | Shopify customers |
| `never_bought` | Email subscriber or account with no order                | Klaviyo ("Placed Order zero times")              | Klaviyo profiles  |
| `app`          | Used the app in the last 90 days                         | Klaviyo app events                               | Klaviyo profiles  |

**Access:** the Shopify segments read each customer's order count, spend, last order and email. The app's approved scopes (`read_orders`, `write_customers`) already return those fields on this store; checked 5 Nov 2026 with the app's own token. No extra protected-customer-data request is needed.

**Klaviyo-only segments** (`never_bought`, `app`) are Klaviyo profiles, many with no Shopify customer behind them. They live only in Klaviyo, as Klaviyo's own segments, and the sync neither reads nor tags them. They get no `segment:` tag, so their offers can only use `email_link` or `codes`.

## Settings

Thresholds live on the **Campaign settings** record (metaobject type `campaign_config`, handle `settings`, admin only), so they change without a release:

| Field                | Holds                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segment_thresholds` | JSON overrides: `lapsedMonths` (12), `atRiskMisses` (2), `atRiskDays` (90), `dormantFromDays` (90), `dormantToDays` (180), `bestTopPercent` (10), `bestSubscribedMonths` (12). A missing or bad key keeps its default, and the CLI says which. |
| `segment_counts`     | Written by `campaigns segments --apply`: each segment's size and when it was counted. The calendar shows it.                                                                                                                                   |

(The type is `campaign_config` because Shopify reserves `campaign_settings`.)

## How membership is kept

A nightly job, `pnpm campaigns segments --apply --tags` (`.github/workflows/segment-counts.yml`), like price history. It does steps 1, 2 and 4 today; step 3 is planned:

1. Works out each Shopify segment's members from the sources above, as Shopify customer IDs. Recharge customers map through Recharge's `external_customer_id`; one with no Shopify customer is counted and left out.
2. **In Shopify:** reads who has each tag now (`customers(query: "tag:'segment:<key>'")`), then adds `segment:<key>` to new members (`tagsAdd`) and removes it from tagged customers who are no longer members (`tagsRemove`). Shopify is the record of who's tagged, so nothing else is stored. This is the tag the Function's `audienceTags` reads.
3. **In Klaviyo (planned, SHO-208):** will keep a static list per segment ("Segment: lapsed") in step, by the Shopify customer's email. A member with no email is counted and left out. These are **lists, not segments**, so membership is exactly the job's, never Klaviyo's own logic.
   - **Adding someone to a list can send a message** if a live flow is triggered by that list. So before changing a list, the sync looks up the flows it triggers (Klaviyo's flows-triggered-by-list). **If any flow is live, it changes nothing for that list and reports it.** Draft and manual flows are allowed. Every list the sync creates is new, so it starts with no flows.
   - Campaign emails to a list stay drafts until Ben approves them, as always.
4. Plans unless `--apply`, like every other command, and writes tags only with `--tags`. The calendar shows each segment's count and when it was last synced.
   - **A run that would take a tag off more than half of a segment (and more than 10 people) is refused**, since that's usually a failed read. Check, then rerun by hand with `--force-tags`.
   - The nightly workflow skips with a notice until the `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_APP_CLIENT_SECRET` and `RECHARGE_API_TOKEN` repository secrets are all set.

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
- **Sync** makes one discount per segment offer, alongside the public discount: for `sign_in`, a Function discount with `audienceTags: ["segment:<key>"]`; for `email_link` and `codes`, a code discount with one single-use code per member, loaded into a Klaviyo coupon as #208 does. Discounts don't combine, so a shopper in a segment gets the better of their offer and the public one; Shopify picks the larger.
- **Terms:** a sentence per segment offer ("Lapsed subscribers, signed in: 30% off one-time purchases").
- **Check:**
  - every segment offer parses;
  - its segment has members;
  - its delivery route exists (codes made, an email drafted);
  - the margin floor holds for the deepest offer.
- **The calendar's offer editor (#228)** gets a tab per segment, with the same side-by-side preview.
- **Surfaces:** a signed-in shopper sees their segment's offer on the campaign page and product pages. This needs their tags, which the storefront can't read with the public Storefront token. It goes through the Customer Account API session (#76), so it lands after sign-in does. Until then, segment offers are told by email and applied at checkout.

## Decisions (Ben, 5 Nov 2026)

1. **Klaviyo lists:** yes. The nightly job may create and update one static list per segment (`Segment: <key>`). It never sends; emails stay drafts until approved.
2. **Shopify tags:** yes. The nightly job may add and remove `segment:<key>` tags on customers.
3. **Protected customer data:** not needed; the approved scopes return every field the segments read (see Segments).
4. **First segments:** `lapsed` (win-back) and `at_risk` (a "keep your plan" perk, not a discount).
   - **The `at_risk` perk** uses the existing renewal path: `campaigns perks <handle>` adds a free item to the next Recharge delivery, which the checkout Function can't. It gains a `--segment at_risk` option that limits it to that segment's subscriptions. Without the option it keeps adding the perk to every active subscription, as now.
5. **Thresholds:** 12 months for lapsed, 90–180 days for dormant, top 10% for best, adjustable on the Campaign settings record.
