# Build your stack (Shopify Function)

**10% off one-off items when an order holds 3 or more different products.**
An automatic order discount, so it applies on web, the app and the Liquid
theme without a code, and shows at checkout as "Build your stack: 10% off".

- **Different products**, not lines: two sizes of the same supplement count once.
- **Subscriptions count towards the three, but aren't discounted again.**
  They already have their subscribe-and-save price, so subscription lines are
  excluded from the 10%.
- `STACK_SIZE` and `STACK_PERCENT` in `src/cart_lines_discounts_generate_run.ts`.

## Commands

Same as `../cart-limits`: `pnpm typecheck`, `pnpm test` (fixtures run as
WebAssembly through Shopify's function runner), `pnpm function:build`.

## Going live

Not on the store yet. After `shopify app deploy` and installing the app, create
an automatic discount from this Function (Discounts → Create discount → Build
your stack) with the **Order** class. Its combination settings decide whether
it stacks with a discount code.
