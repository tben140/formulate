# Subscription summary (checkout UI extension)

"Your subscriptions", under the items at checkout, only when the order has a
subscription: what repeats, how often, the discount on each delivery, and that
it can be skipped, paused or cancelled any time.

Checkout tells an extension only whether a line repeats, so the frequency and
discount come from the selling plan through the Storefront API
(`../../shared/subscription-plan.ts`, unit-tested here with `pnpm test`).
Recharge writes the frequency as the plan option "Order Frequency and Unit".

**Setting:** _Where shoppers manage subscriptions_, a full `https://` link
(the Recharge customer portal until our own portal exists). Empty means the
sentence shows without a link.

Wording is factual only, per `docs/claims-wording.md`.

`shopify.d.ts` is written by `shopify app build`; it's committed so CI can
typecheck, in the CLI's own formatting so a build leaves no diff.
