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

## The customer portal (read-only)

Built for web and the app (SHO-71, SHO-72): a signed-in customer sees their
subscriptions, how often each is delivered, and the next deliveries with what
they'll cost. Changes (skip, swap, pause, cancel) are SHO-73 and SHO-74. For
now, the emails' portal link (Recharge's hosted portal) covers them.

**How a customer becomes a Recharge session.** Signing in to the storefront
(the [Customer Account API](integration-customer-accounts.md)) gives an access
token. Recharge exchanges that for its own one-hour session:

```
POST https://admin.rechargeapps.com/shopify_customer_account_api_access
X-Recharge-Storefront-Access-Token: strfnt_…
{ "customer_token": "<Customer Account access token>", "shop_url": "<shop>.myshopify.com" }
→ { "api_token": "…", "customer_id": … }
```

Reads then go to `api.rechargeapps.com` with that `api_token`, API version
`2021-11` and `shop_url`, and Recharge scopes them to that customer.

**A thin module, not Recharge's SDK** (`packages/recharge`, decided in SHO-55):

- The SDK's customer-account login is that one call.
- Its React Native support is unstated.
- The repo's shared packages are bare `fetch`.

The cost is tracking Recharge's API version ourselves.

|                       | Web                                        | App                                     |
| --------------------- | ------------------------------------------ | --------------------------------------- |
| Recharge session      | server memory, per instance, under an hour | app memory                              |
| Expired session (401) | log in again once                          | the same                                |
| Storefront token      | `RECHARGE_STOREFRONT_TOKEN`, server-only   | `EXPO_PUBLIC_…`, as Recharge designs it |

**Never subscribed is not an error.** Recharge returns no session for a
customer it has never seen, and the portal shows its empty state.

**Rate limits:** Recharge allows about two requests a second, so a page is one
login (cached for the hour) and at most two reads, in sequence.

**Testing without Recharge:** the package's tests use fixtures taken from the
store's real test subscription (personal data removed). On web, the Recharge
hosts can be overridden (`RECHARGE_ADMIN_URL`, `RECHARGE_API_URL`) to point at
a local fake for rendering real pages.

## Planned: Recharge → Klaviyo

Subscription lifecycle events feeding Klaviyo flows: upcoming charge, charge
failed, subscription cancelled.

This is largely configuration in the Recharge admin rather than code, which makes
it unusually high value per hour spent — real, cross-system behaviour for very
little build. See [Klaviyo](integration-klaviyo.md).

## Open questions

- Whether webhooks are needed for the read-only scope, or whether reading on
  demand is sufficient. Read-on-demand is the current assumption, because with no
  local copy of the data there is nothing to keep in sync.

## Related

- [Domain model](domain-model.md) · [Klaviyo](integration-klaviyo.md)
- [Mobile app](surface-mobile.md) — where the test order was placed
