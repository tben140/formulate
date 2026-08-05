# Domain model

What the nouns mean here, and where Shopify's shape and ours disagree. This is a
working note about a real store, not a textbook model.

The store is `tben140plus-xcorpito.myshopify.com` — a development store, GBP,
Europe/London, currently stocked with Shopify's seed catalogue of snowboards.
Replacing that with real branding is outstanding and is tracked in Linear.

## Product

Shopify's `Product` → `ProductVariant` → price is the model, and we do not
reshape it. Two things about it bite in practice.

**Price lives on the variant, not the product.** The list views use
`priceRange.minVariantPrice`, which is why a card can read "from £749.95" while
the product page shows several different prices. `formatMoney` in
`packages/shopify` takes a `{ amount, currencyCode }` pair rather than a number,
so a currency can never be lost on the way to the screen.

**Availability is per variant.** `availableForSale` is a variant field. A product
with one sold-out variant is still purchasable, so "sold out" is never a
product-level statement.

### Publication is part of the model

A product is not simply "in the store". It is published to specific _sales
channels_, and each surface sees a different catalogue as a result. This is the
single most surprising thing about the store, so it is worth stating precisely.

The storefront opens on `automated-collection`, a smart collection with the rule
`variant price > 200 AND < 800`. Shopify's admin counts **8** products in it:

| Product                            | Online Store  | Headless | Visible in        |
| ---------------------------------- | ------------- | -------- | ----------------- |
| The Collection Snowboard: Liquid   | yes           | yes      | all three         |
| The Collection Snowboard: Hydrogen | yes           | yes      | all three         |
| The Complete Snowboard             | yes           | yes      | all three         |
| The Compare at Price Snowboard     | yes           | yes      | all three         |
| The Multi-location Snowboard       | yes           | yes      | all three         |
| The Multi-managed Snowboard        | yes           | yes      | all three         |
| The Hidden Snowboard               | **no**        | yes      | web + mobile only |
| The Archived Snowboard             | no (archived) | no       | nowhere           |

So the Liquid theme renders **6** products and the two headless surfaces render
**7**, from the same collection handle. That is correct behaviour, not drift —
see [ADR 0005](adr/0005-parity-means-design-not-data.md).

Anyone comparing the surfaces side by side will notice this within seconds, so
it needs saying out loud rather than explaining after the fact.

## Collection

Two kinds, and the difference matters for anything cache-flavoured.

- **Smart (automated)** — membership is a rule, evaluated by Shopify.
  `automated-collection` is one. A price edit silently changes what the
  storefront shows.
- **Manual** — an explicit list. `hydrogen` is one.

Because smart collections re-evaluate server-side, a storefront cannot treat
collection membership as stable between requests.

## Cart

**Not yet built.** Design, and the trap already identified:

> A Storefront cart ID is `gid://shopify/Cart/{token}?key={secret}`. The whole
> string is the identifier. Strip the `?key=` and subsequent queries return
> _stripped_ data with no error naming the cause — the request appears to
> succeed and simply returns less.

Persistence differs per surface and is not being abstracted:

| Surface | Where the cart ID lives                          | Why                                                      |
| ------- | ------------------------------------------------ | -------------------------------------------------------- |
| Web     | httpOnly cookie, written from a Server Action    | The token must not reach client JavaScript               |
| Mobile  | `expo-secure-store`                              | Survives app restarts; the OS keychain is the right home |
| Theme   | Shopify's own cart cookie, via the AJAX Cart API | The platform already owns this                           |

Forcing one abstraction over three genuinely different storage models would
produce a lowest-common-denominator API that fits none of them.

`buyerIdentity.countryCode` must be set on cart creation. Without it checkout
defaults to the United States on a GBP store based in the UK.

## Order

Created by Shopify at checkout; the storefront never writes one.

One sharp edge, established during the checkout spike: the Checkout Sheet Kit's
`completed` event returns an order identifier of the form
`gid://shopify/OrderIdentity/{id}`, which is **not** the Admin API's
`gid://shopify/Order/{id}`. Passing one where the other is expected fails at
lookup time, not at type-check time.

Test order #1001 (£774.90, PAID) is the reference — see
[the mobile surface note](surface-mobile.md).

## Customer

Deliberately undecided, and worth being honest about why.

Shopify now has two account systems: classic customer accounts and the newer
**Customer Account API** with passwordless login. Recharge's customer portal is a
third session on top. Nothing in this project authenticates a customer yet, so
committing to one would be guessing.

The first thing that forces the decision is the read-only Recharge portal, and
that note records the constraint: a Recharge portal session is issued by
Recharge, not by Shopify, so "log in" there does not mean the same thing as
"log in" to the storefront.

## Subscription

Shopify models a subscription as a **selling plan** attached to a variant.
Recharge creates and owns its own selling plan group, and this store makes the
resulting ambiguity concrete.

`selling-plans-ski-wax` carries **five** selling plan groups:

| Group                  | `appId`  | Origin            |
| ---------------------- | -------- | ----------------- |
| Prepaid                | `null`   | Shopify seed data |
| Subscription           | `null`   | Shopify seed data |
| Try Before You Buy     | `null`   | Shopify seed data |
| Preorder               | `null`   | Shopify seed data |
| Delivery every 30 days | `294517` | **Recharge**      |

Four of the five are decorative seed data that no app manages. Only the fifth
produces a real subscription. Any UI offering "subscribe and save" therefore has
to **discriminate by the owning app**, not simply render every selling plan group
it finds — otherwise a customer can select a plan that nothing will ever fulfil.

See [the Recharge note](integration-recharge.md).

## Company

B2B only, and out of scope. Kept in [future-b2b.md](future-b2b.md) so the
reasoning survives.

## Related

- [Architecture](architecture.md)
- [Recharge](integration-recharge.md) · [Klaviyo](integration-klaviyo.md)
- [Decision records](adr/README.md)
