# Subscribe & save switch (checkout UI extension)

Under each one-time line that has a subscription plan: "Subscribe & save 15%,
delivered every 30 days", with the renewal terms beside it. One tap sets the
line's selling plan (`applyCartLinesChange`), and the order reaches Recharge
as a subscription, as if the plan had been chosen on the product page. Undo
is offered straight after.

Our own version of Recharge's Checkout Upsell, which needs Recharge's Pro plan
(Shopify Plus either way). Only the 30-day plan is offered, so the shopper's
quantity keeps its meaning; the 60- and 90-day plans set the quantity
themselves. Only plans an installed app manages, and no introductory prices
(`../../shared/subscribe-upgrade.ts`, tested from `subscription-summary`).

Hidden for nested lines (free gifts) and when checkout doesn't allow line
changes (`instructions.lines.canUpdateCartLine`). Express wallets that skip
checkout never show it.
