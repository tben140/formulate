# campaign-discount

A campaign's offer, charged at checkout (SHO-169, "step two" in
[docs/campaigns.md](../../../../docs/campaigns.md)). One Function serves every
campaign: each campaign gets its own automatic (or code) discount using it, and
that discount's config says what to give.

## Config

The discount's `$app:campaign-discount.config` metafield, written by
`pnpm campaigns sync <handle>` from the campaign record:

```json
{
  "collectionIds": ["gid://shopify/Collection/524187107640"],
  "variantIds": [],
  "message": "Black Friday",
  "rules": { "type": "percent", "percent": 25 },
  "usedTags": [],
  "audienceTags": []
}
```

- `collectionIds` are also the input query's variables: a line is in the
  campaign when its variant (or its product) is in one of them. With no
  config, the variable defaults to an empty list, so nothing is in it.
- `variantIds`, when not empty, narrows it to those variants (the campaign's
  variant field). Anything but a list of ids gives no discount, never a wider
  one.
- `rules` are the campaign's `offer_rules`: `percent`, `tiered` or `bundle`,
  plus:
  - `appliesTo`: `"one_time"` (the default), `"all"`, or `"subscriptions"`
    for a subscribe-first offer. The older `"oneTimeOnly": false` still means
    `"all"`. Recharge's renewals don't pass through checkout, so a
    subscriptions offer is the first delivery only;
  - `maxUnits`: at most this many units of each product at the campaign
    price per order (percent and tiered);
  - `oncePerCustomer`: no discount for a customer tagged with one of
    `usedTags` (needs at least one).
- `usedTags` and `audienceTags` are input query variables too, checked
  against the signed-in customer's tags. With `audienceTags`, only customers
  with one of them get the offer (a win-back offer to lapsed subscribers, for
  example). A guest has no customer: they're never limited by `usedTags` and
  never in an audience.
- Anything that doesn't parse gives no discount.

The discount's own start and end dates decide when it runs, so they must
match the campaign's; `campaigns check` compares them.

## What it gives

| Rules     | Discount                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `percent` | N% off each eligible line                                                                                                                                         |
| `tiered`  | N% off each eligible line once they add up to a tier (before discounts). Thresholds are in the shop's currency, converted at checkout's `presentmentCurrencyRate` |
| `gift`    | One unit of `variantId` free once the campaign's items (not the gift) reach `minSubtotal`, shop currency. The shopper adds the gift                               |
| `bundle`  | 100% off the cheapest `free` of every `buy` eligible items                                                                                                        |

Subscriptions are left out by default: they already save 15%. A capped line
is discounted for only part of its quantity.

## Tests

28 fixtures in `tests/fixtures`, built to WebAssembly and run through
Shopify's function runner: `pnpm --filter @formulate/function-campaign-discount test`.

## Going live (Ben)

1. `shopify app deploy`.
2. `pnpm campaigns sync black-friday-2026` creates the campaign's discount on
   this Function, inactive, with the config and the campaign's dates.
3. Swap: deactivate the plain 25% automatic discount, activate the Function's.
