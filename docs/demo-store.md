# The demo store

`tben140plus-xcorpito.myshopify.com` is a Shopify development store, and this
project's storefronts are a portfolio piece. Nothing sold through it is real.
This note records what makes that true, how the store is configured to behave
like a real shop anyway, and how to put it back when test orders wear it down.

Most of this is **store configuration, not code**. None of it is in git, so it
is written down here.

## What visitors are told

Every surface shows the same notice above its content:

> **Demo store** — this is a portfolio project. Checkout runs in test mode: you
> won't be charged and nothing will be shipped.

| Surface | Where                                                                                         |
| ------- | --------------------------------------------------------------------------------------------- |
| Web     | `apps/web/components/demo-notice.tsx`, above the header in `app/layout.tsx`                   |
| Mobile  | `apps/mobile/components/demo-notice.tsx`, via the stack's `screenLayout` in `app/_layout.tsx` |
| Theme   | `apps/theme/sections/demo-notice.liquid`, first in the header group                           |

Web and mobile read `DEMO_STORE_NOTICE` from `packages/shopify/src/config.ts`.
The theme cannot import it, so its section settings default to a copy. Change
both together.

Klaviyo flow emails carry it too, as a dark bar at the top of the body between
`<!-- demo-notice:start -->` and `<!-- demo-notice:end -->`. That is a third
copy, and it lives in Klaviyo rather than git. It is in every live flow email
except two:

- **Abandoned checkout** is still a placeholder.
- **Back in stock** uses Klaviyo's drag-and-drop editor, which the API cannot
  edit as HTML.

⚠️ Klaviyo will not let a flow's own template be edited through the API. To
change the notice, create a new template and point the flow action's
`template_id` at it; Klaviyo clones it into the flow.

It is not dismissible: it states what happens to an order, so it has to be
there on the page someone checks out from. Shopify's own checkout pages are out
of reach; they show a "Testing instruction" panel instead.

### Keep every claim true

- **"You won't be charged."** True because checkout uses Shopify's test gateway,
  which accepts only its test card numbers (`1` approves, `2` declines, `3`
  fails). ⚠️ Enabling a real payment provider makes the notice false. Change the
  wording in the same moment, or don't do it.
- **"Nothing will be shipped."** True because nothing is fulfilled. Orders are
  real Shopify orders, though, and appear in the admin.

## How the store is set up to behave like a real one

Configured 2026-09-26 through the Admin API.

### Stock

All 44 variants track inventory at one location and **stop selling at zero**
(`inventoryPolicy: DENY`), so sold-out and low-stock states are real rather than
simulated.

| Variants                                                                           | Available | Why                                                             |
| ---------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| Everything not listed below                                                        | 250       | Behaves like a stocked shop; survives many test orders          |
| Whey Protein — Strawberry / Unsweetened; Electrolyte Powder — Citrus / Unsweetened | 3         | Exercises short adds: asking for 5 adds 3 and says so (SHO-131) |
| Magnesium Glycinate — 200 mg                                                       | 0         | A sold-out **variant** on an in-stock product                   |
| Lion's Mane Mushroom (whole product)                                               | 0         | A sold-out **product**; also what back-in-stock needs (SHO-118) |

Test orders use stock up, and the low-stock variants go to zero after a few. See
[Resetting stock](#resetting-stock).

### Location and shipping

- One location, "Shop location", at a **placeholder** UK address in Manchester.
  A Toronto seed location was deleted.
- The General delivery profile has a **United Kingdom** zone in GBP:

  | Method                 | Rate  | When           |
  | ---------------------- | ----- | -------------- |
  | Standard delivery      | £3.95 | subtotal < £40 |
  | Free standard delivery | £0    | subtotal ≥ £40 |
  | Express delivery       | £6.95 | always         |

  The **£40** threshold is the one the free-shipping progress bar (SHO-115)
  counts towards.

- The US ("Domestic") and International zones are Shopify's seed defaults, still
  in USD. They are harmless for a UK demo, but untidy.

### Channels

Every Double Helix collection with products is published to both the **Online
Store** (theme) and the **Tben140plus Headless** channel (web and mobile). The
surfaces only see collections on their own channel, so a collection published to
one and not the other makes them disagree, including in Klaviyo `Categories`
(SHO-126). Vegan is empty and Online Store only.

## Resetting stock

Test orders reduce stock like real ones. To restore the plan above, set each
variant's **available** quantity at "Shop location" back to its target, with
reason `correction`.

The quickest route is asking Claude Code with the Shopify connector: "reset the
demo stock per docs/demo-store.md". It reads current levels first and uses a
compare-and-swap (`changeFromQuantity`), so it refuses rather than overwrites if
stock moved in the meantime. By hand: Shopify admin → Products → Inventory.

Leave the inventory policy alone. Everything must stay on "stop selling when out
of stock", or the sold-out states stop being real.

## Things a demo store still does for real

- **Emails.** Klaviyo sends real email to anyone who signs up, and abandoned-cart
  flows fire for real test checkouts.
- **Subscriptions.** A subscription bought through the test gateway creates a
  real Recharge subscription, whose renewal charge then fails. Harmless, but it
  appears in Recharge.
- **Orders.** Every test order is a real order in the admin. Archive rather than
  delete them if the list gets in the way.

## Related

- [Web storefront](surface-web.md) · [Mobile app](surface-mobile.md) · [Liquid theme](surface-theme.md)
- [Klaviyo](integration-klaviyo.md) · [Recharge](integration-recharge.md)
