# Double Helix (Shopify app)

The app in Shopify's Dev Dashboard that carries the store's Shopify-side
code. It has **no admin pages** of its own, and asks for one permission,
`write_discounts`, which a discount Function needs before its discounts can
be created on the Discounts page. Everything here runs inside Shopify.

| Extension            | Kind                                   | What it does                                                                                                                                     | Code                              |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Cart limits          | Cart and checkout validation Function  | At most 6 of any one product per order, in carts and checkout on web, the app and the theme (not POS, Admin API orders or subscription renewals) | `extensions/cart-limits`          |
| Build your stack     | Discount Function                      | 10% off one-off items with 3+ different products                                                                                                 | `extensions/stack-discount`       |
| Subscription summary | Checkout UI extension                  | "Your subscriptions" under the items at checkout                                                                                                 | `extensions/subscription-summary` |
| What happens next    | Checkout UI extension (thank-you page) | Dispatch, tracking and subscription next steps                                                                                                   | `extensions/order-next-steps`     |

The two checkout panels share `shared/subscription-plan.ts`, which reads a
selling plan's frequency and discount. Each extension's README has the detail.

## Deploying

From this folder, on a machine where the Shopify CLI is logged in to the
Double Helix organisation:

```sh
npx shopify app deploy --allow-updates --version 0.6.0 --message "What changed"
```

This builds every extension, uploads them as a new app version and
**releases it straight away**. On a store where the app is already set up
(rule on, discount created, panels placed), shoppers get the new code
immediately: a deploy is not a preview. To upload without releasing, add
`--no-release` and release the version later from the Dev Dashboard. On a
store where nothing is switched on yet, nothing shows until the admin steps
below. **Commit any `uid` lines the deploy writes** into the extensions'
`shopify.extension.toml` files: Shopify identifies each extension by them,
and without them the next deploy creates duplicates.

Not deployed from CI yet.

## Turning it on (once per store)

1. **Install:** Dev Dashboard → Double Helix → Install app → choose the store.
   Approve `write_discounts`. (After a permission change, Settings → Apps →
   Double Helix asks you to approve the update.)
2. **Cart limit:** Settings → Checkout → Checkout rules → Add rule →
   _Cart limits_ → Save, then turn it on.
3. **Discount:** Discounts → Create discount → _Build your stack_ →
   automatic. Decide whether it combines with discount codes.
4. **Panels:** Settings → Checkout → Customize:
   - on **Checkout**, Add app block → _Subscription summary_ (it sits under
     the items; that place is fixed);
   - on **Thank you**, Add app block → _What happens next_;
   - fill in each block's settings (the manage-subscriptions link, the
     dispatch sentence), then Save.

Uninstalling the app removes all four at once.

## Checking it works

| Check                                    | Expected                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| A cart of 7 of one product               | Refused, even at add-to-cart: "You can buy up to 6 of … in one order." |
| 3 different one-off products at checkout | "Build your stack: 10% off"                                            |
| A subscription at checkout               | "Your subscriptions … every 30 days with 15% off each delivery."       |
| A completed order                        | "What happens next" on the thank-you page                              |

Last checked on the dev store on 2026-10-18 (version 0.2.0): the cart limit
and the subscription summary passed; the discount wasn't created yet; the
thank-you panel needs a test order.

## Tests

`pnpm turbo typecheck test --filter='./apps/shopify-app/extensions/*'` runs
in CI: the Functions' fixtures as WebAssembly through Shopify's function
runner, and the shared plan reader's unit tests.
