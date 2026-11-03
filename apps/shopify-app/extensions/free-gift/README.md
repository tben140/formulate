# Free gift

A product discount Function: **100% off one unit of a product's free gift**,
when the gift is nested under that product in the cart.

- **Setting a gift:** the product's (or a variant's) **Free gift** field,
  `custom.free_gift`, a variant reference. A variant's own value overrides
  the product's. No code change to run a promotion.
- **Adding it:** the storefronts add the gift as a nested cart line under the
  product (`packages/shopify/src/free-gift.ts`, on web, the app and the
  theme). Shopify removes it when the product is removed.
- **Only nested gifts are free.** A gift added on its own, or under a product
  that doesn't give it, pays its price. One per product line, whatever the
  quantity.
- **With subscriptions:** the gift is a one-time line, so it ships with the
  first order only.
- **The stack discount** ignores nested lines: a gift can't complete a stack,
  and isn't discounted twice.

## Setting it up in a store
1. `shopify app deploy` (with the rest of the app).
2. Create an automatic discount from this Function (Discounts → Create
   discount → Free gift), product class, combining with order discounts so
   it works alongside "Build your stack".

## Tests
`pnpm test` builds the Function to WebAssembly and runs every fixture in
`tests/fixtures` through Shopify's function runner.
