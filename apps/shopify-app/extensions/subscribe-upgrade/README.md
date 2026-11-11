# Subscribe & save switch (checkout UI extension)

Under each one-time line that has a subscription plan: "Subscribe & save x%,
delivered every 30 days", with the renewal terms beside it. The saving and the
price come from the plan in Recharge (through Shopify), never from this code,
so changing a plan's percentage changes the button. One tap sets the
line's selling plan (`applyCartLinesChange`), and the order reaches Recharge
as a subscription, as if the plan had been chosen on the product page. Undo
is offered straight after.

Our own version of Recharge's Checkout Upsell, which needs Recharge's Pro plan
(Shopify Plus either way). Only the 30-day plan is offered, so the shopper's
quantity keeps its meaning; the 60- and 90-day plans set the quantity
themselves. Only plans an installed app manages, and no introductory prices
(`../../shared/subscribe-upgrade.ts`, tested from `subscription-summary`).

The plan is read when checkout loads and again after the tap. If it changed
in between, Shopify charges the new terms, so the shopper is told them before
paying ("This plan changed while checkout was open…"), with the undo button
beside them. If it can't be read again, the renewal is stated without a price
or a saving rather than risk a wrong one.

The switch shows only for a 30-day plan with a percentage off every delivery,
written by Recharge as the option "30-day". A fixed £ discount, a 0% plan or
an introductory price hides it.

Hidden for nested lines (free gifts) and when checkout doesn't allow line
changes (`instructions.lines.canUpdateCartLine`). Express wallets that skip
checkout never show it.
