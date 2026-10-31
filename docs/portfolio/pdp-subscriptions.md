# Subscriptions on the product page

> Draft. Rewrite in your own words. Several points below are in review in
> the October batch, not live yet: each says so.

**For:** a supplement, coffee or skincare brand adding Subscribe & save with
Recharge, who wants it to look trustworthy and charge correctly.

**The claim:** most theme work stops at one-time purchases, because selling
plans are fiddly and Recharge adds a layer. One shared package
decides which subscription plans can be offered and at what price, for a
Liquid theme, a headless web store and a native app; how each surface shows
them is its own.

**What it gets right, each from a real mistake caught first:**

- **Only plans that will actually renew.** A store can carry selling plans
  that no app manages: Shopify's seed data. They add to the cart and check out
  fine, then never charge or ship again. Only plans owned by an installed app
  are offered (`purchasableSellingPlanGroups` in `packages/shopify`).
- **The price Shopify will charge**, from each plan's own price allocation,
  never computed by discounting in the browser.
- **Plans that match the supply.** 30-, 60- and 90-day plans once all showed
  the same price, because each shipped a 30-day unit: a 90-day subscriber
  would have run out after a month. In review (#143): the plan sets the
  quantity. Today every plan adds one unit.
- **Free delivery that stays free.** A first order over the threshold
  promised "free shipping every 30 days", but each renewal was priced alone,
  under the threshold. Free delivery now comes from a delivery profile on the
  subscription plans.
- **The renewal terms next to the button**, and cancelling as easy as
  subscribing (UK and US rules; `docs/compliance.md`). In review: #141 and
  #136.

**Recording to make:** choose a flavour, switch between one-time and the 30-,
60- and 90-day plans (price and per-delivery saving update), then the cart
showing the plan.
