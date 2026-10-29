# Your Daily Pack (custom blends)

A shopper picks 2, 3 or 4 ingredients and gets them as one monthly pack,
bought once or on subscription. One product, priced by how many ingredients
it holds; the chosen ingredients travel with the cart line to the order and
the subscription.

## The product

**Your Daily Pack** has one variant per size. Each variant carries
`double_helix.blend_size` (an integer); that field, not the variant title, is
what marks a product as a pack.

| Size          | One-time | Subscription (30 days, 15% off) |
| ------------- | -------- | ------------------------------- |
| 2 ingredients | £19.95   | £16.96                          |
| 3 ingredients | £24.95   | £21.21                          |
| 4 ingredients | £29.95   | £25.46                          |

The subscription plan is Recharge's 30-day plan only. A pack is a month of
sachets, so a 60- or 90-day delivery would leave gaps.

## The ingredients

Each ingredient is a **`blend_ingredient`** metaobject, so the range changes in
Shopify admin with no deploy.

| Field     | Notes                                                                    |
| --------- | ------------------------------------------------------------------------ |
| `name`    | "Vitamin D3 (from lichen)". The bracketed source is dropped in the label |
| `code`    | Short, lower case, e.g. `d3`. **Permanent once sold** (see below)        |
| `amount`  | The dose per sachet, e.g. "25 µg"                                        |
| `nrv`     | Percentage of the nutrient reference value, if there is one              |
| `claim`   | An authorised health claim, worded exactly as authorised                 |
| `caution` | Shown beside the ingredient, e.g. for vitamin K2 and iodine              |
| `vegan`   | true or false                                                            |
| `sort`    | Order in the picker                                                      |

An entry missing its name, code, amount or claim is left out of the picker.

## What goes on the order

Two line properties, both built on the server (or the Worker) from the codes,
never taken from the browser:

| Property | Example                               | Seen by                                           |
| -------- | ------------------------------------- | ------------------------------------------------- |
| `_blend` | `d3,k2,mg`                            | Code only (hidden at checkout by the leading `_`) |
| `Blend`  | `Vitamin D3 + Vitamin K2 + Magnesium` | The shopper at checkout, the order, the warehouse |

Shopify copies line properties to the order, and Recharge to the subscription
(checked with order #1011). So each renewal is packed from the subscription's
own properties, and "Edit my blend" in the portal changes them for future
deliveries.

**Codes are permanent.** A subscription keeps its codes for as long as it
runs. Before retiring an ingredient, decide what its existing subscribers get
instead: deleting the entry stops new picks, and the portal can no longer
name it.

## Adding an ingredient

1. In Shopify admin, add a `blend_ingredient` entry with a new code.
2. Check the claim word for word against the GB register of authorised
   health claims.
3. Publish it. Web, the app and the theme show it on the next page load.

The presets ("Vegan essentials", "Immunity", "Bones", "Energy") live in
`packages/shopify/src/blend.ts`. A preset whose ingredients aren't all in the
range is hidden.

## Where it lives

- `packages/shopify/src/blend.ts`: the rules (checking a blend against its
  size, the label, the properties, the presets), with tests.
- Web: `lib/blend.ts` checks every blend on the server before it reaches the
  cart; `components/blend-picker.tsx`.
- App: `lib/blend.ts`, `components/blend-picker.tsx`.
- Theme: `snippets/blend-picker.liquid` and `assets/blend-picker.js`.
- Portal ("Edit my blend"): `apps/api/src/blend.ts`.

## Known gap

The Storefront API is public, so someone could add a pack with properties that
don't match its size, skipping our checks. The fix is a Cart Validation
Function that rejects such a line at checkout.
