# Future: B2B vs blended

> **Out of scope.** Nothing here is being built. This note exists so the
> reasoning survives, and so nobody re-derives it from scratch later.

## What "blended" means

One store serving both consumers and trade buyers, as opposed to a dedicated B2B
store alongside a consumer one.

Shopify supports blended natively on Plus: the same storefront serves both, and a
logged-in company contact sees different prices, different catalogue, and
different checkout terms. Below Plus, B2B is effectively unavailable, which makes
this a Plus-only conversation.

## Where the two models actually diverge

**Catalogue and pricing.** B2B introduces price lists and per-company catalogues.
A product's price stops being a property of the variant and becomes a function of
`(variant, company location)`. That is the single change with the widest blast
radius — every price display, every cart line, and every cached page becomes
buyer-dependent.

**Customer accounts.** B2B requires the new customer accounts system; classic
accounts do not support company contacts. So choosing B2B forecloses a decision
this project currently holds open — see the
[domain model](domain-model.md#customer).

**Checkout.** Payment terms (net 30), purchase order numbers, tax exemption. All
three change what checkout _is_, not merely how it looks.

**Quantity rules.** Minimums, maximums and increments per product. Cheap to
render, easy to forget to validate.

## Why a dedicated B2B store is often chosen anyway

Blended is architecturally tidier and operationally messier. Every page has to be
correct for two audiences at once, and caching gets substantially harder because
a price is no longer a property of a URL. Teams frequently take a second store to
avoid that, accepting duplicated catalogue management as the cost.

That trade — **correctness complexity versus duplication** — is the actual
decision, and it is a business one rather than a technical one.

## What it would change in this build

| Surface      | Impact if B2B were added                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Liquid theme | Largest. Every price, the catalogue, checkout terms, quantity rules                                                       |
| Web          | Large. Prices become per-buyer, so server-render caching assumptions change                                               |
| Mobile       | Largest of all, arguably — the app has no server, so a public Storefront token cannot see company-specific pricing at all |

That last row is the interesting one. **A public Storefront access token is
inherently anonymous.** B2B pricing requires a buyer-authenticated context, so a
B2B mobile app cannot use the architecture `apps/mobile` currently uses. It would
need a backend of its own, or the Customer Account API with a real session.

## Why it is out of scope

It needs Shopify Plus, a company structure, price lists and a second customer
model, before a single visible pixel changes. That is a large amount of
configuration in exchange for a demonstration that looks almost identical to the
consumer one.

## Related

- [Domain model](domain-model.md) · [POS extension](future-pos.md)
