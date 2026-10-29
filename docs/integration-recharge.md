# Integration: Recharge

**Status:** installed on the store, with one live test subscription. The customer
portal is designed but not built.

## Why Recharge

Subscriptions are the single most common non-trivial Shopify integration, and
Recharge is the incumbent. Shopify's native subscription APIs exist, but almost
no merchant uses them directly — they use an app, and that app owns the customer
relationship after checkout. Building against the incumbent is a more honest
demonstration than building against the API nobody ships on.

The alternative considered was Shopify's own subscription APIs with a
hand-rolled contract manager. Rejected: it would demonstrate API fluency while
avoiding the part that is actually hard, which is that **a second system now owns
part of your customer's state**.

## What is verified

A real test order completed through the mobile app's Checkout Sheet Kit:

|                       |                          |
| --------------------- | ------------------------ |
| Shopify order         | **#1001**, PAID, £774.90 |
| Recharge subscription | **#854707192**, active   |
| Terms                 | £24.95 every 30 days     |

That order also confirmed something worth writing down, because it was initially
assumed otherwise: **Shopify Payments test mode works with Recharge
subscriptions.** A test-mode transaction produces a real, active subscription
contract on the Recharge side.

## Recharge's model, and where it disagrees with ours

Shopify represents a subscription as a **selling plan** attached to a variant.
Recharge creates and owns its own selling plan group and, after checkout,
maintains its own record of the subscription, charges, and shipping addresses.

This store makes the resulting ambiguity concrete. `selling-plans-ski-wax`
carries five selling plan groups:

| Group                  | `appId`  | Real?             |
| ---------------------- | -------- | ----------------- |
| Prepaid                | `null`   | Shopify seed data |
| Subscription           | `null`   | Shopify seed data |
| Try Before You Buy     | `null`   | Shopify seed data |
| Preorder               | `null`   | Shopify seed data |
| Delivery every 30 days | `294517` | **Recharge**      |

Four of the five are decorative. Only the fifth produces a subscription anything
will fulfil.

> ⚠️ **Any "subscribe and save" UI must discriminate by the owning app.**
> Rendering every selling plan group found on a variant lets a customer choose a
> plan that no system will ever act on. Filter on the owning app before
> rendering.

The wider mismatch: **Shopify's selling plan describes an intent to subscribe;
Recharge's subscription is the ongoing thing.** They are not the same object at
different times — after checkout, the authoritative record of "when does this
customer next get charged" lives in Recharge, not Shopify. Anything the
storefront displays about a subscription's future is Recharge's answer.

## Read-only customer portal (in review: #80)

> Since this was written the scope grew to web **and** the app, reading through
> the Worker (#90). The reasoning below still stands.

Scope is deliberately narrow — **read-only**:

- Customer signs in.
- List active subscriptions.
- Per subscription: next charge date and line items.

No skip, no swap, no pause, no address editing, no cancellation.

The reasoning: the portal's _management_ surface is a large amount of CRUD that
demonstrates very little beyond CRUD. What it does prove — authentication, a
Recharge session, and reading real subscription data across a system boundary —
is entirely present in the read-only version. If the schedule slips, this is the
first thing cut, ahead of Klaviyo.

### The constraint that shapes it

**A Recharge portal session is issued by Recharge, not by Shopify.** "Logged in"
to the storefront and "logged in" to the portal are two different statements. The
portal work is therefore also the thing that forces a decision on customer
authentication generally — see the [domain model](domain-model.md#customer),
which currently records that decision as deliberately open.

## Recharge → Klaviyo (live)

Subscription lifecycle events feed Klaviyo flows. Since 6 October 2026, eleven
Recharge flows are live, among them subscription started, upcoming order,
payment failed, paused, cancelled and expired.

This is largely configuration in the Recharge admin rather than code, which makes
it unusually high value per hour spent — real, cross-system behaviour for very
little build. See [Klaviyo](integration-klaviyo.md).

## Routines as one renewal (SHO-176)

The routine quiz (SHO-161) sells 2 to 4 products. The shopper should get one
routine: one renewal date, one thing to skip or pause. Three ways to do that
were checked:

- **Recharge bundles.** They're built for this, but they need a Recharge plan
  this store doesn't have (the same upgrade question as the storefront token).
- **One bundled cart line** (a Cart Transform `lineExpand`, priced by Shopify
  from its parts). Shopify rejects expand, merge and update operations at
  checkout on a line with a selling plan, so a subscription can't be one.
- **One subscription per product, tied together. This is the one built.**
  Every subscription in the routine carries two line properties: `_routine`
  (an id, hidden at checkout) and `Routine` (the product names, shown). Line
  properties reach Recharge's subscriptions (order #1011, SHO-84). The
  products are bought together on the same roughly-monthly plan, so they
  share a renewal date, and Recharge charges subscriptions with the same date,
  address and payment method as one order.

Shared code: `routineCartLines`, which builds the lines, and `groupByRoutine`,
which gives the portal each routine and its members, in
`packages/shopify/src/routine-quiz.ts`.

**Still to do:**

- **The portal shows a routine as one card.** Skip, pause and reschedule then
  apply to every member, so the dates stay together. It goes on the portal
  stack (#72, #136). Until then, changing one subscription on its own splits
  it from the routine's date.
- **Check with a test order** that Recharge does combine the routine into one
  charge. The order needs the store owner's OK.
- **The app and the theme:** the app's quiz isn't built yet. The theme's
  routine page would post the same two properties.

## Open questions

- Which Recharge API version and auth model the portal reads through.
- Whether webhooks are needed for the read-only scope, or whether reading on
  demand is sufficient. Read-on-demand is the current assumption, because with no
  local copy of the data there is nothing to keep in sync.

## Related

- [Domain model](domain-model.md) · [Klaviyo](integration-klaviyo.md)
- [Mobile app](surface-mobile.md) — where the test order was placed
