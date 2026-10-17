# Cart limits (Shopify Function)

At most **6 of any one product** per order. Counted per product, so a
one-off and a subscription of the same supplement add up, and so do two sizes.

A cart and checkout validation Function: it runs inside Shopify, so the limit
holds on web, the app and the Liquid theme alike, and at checkout, where none
of our code runs. The message sits next to the product's first cart line:
"You can buy up to 6 of Magnesium Glycinate in one order."

The limit is `MAX_PER_PRODUCT` in `src/cart_validations_generate_run.ts`.

## Commands

|                       |                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm typegen`        | Types for the input query, from `schema.graphql`                                                |
| `pnpm typecheck`      | typegen, then `tsc`                                                                             |
| `pnpm test`           | Builds the WebAssembly and runs every `tests/fixtures/*.json` through Shopify's function runner |
| `pnpm function:build` | Build only (not `build`, so the repo-wide `turbo build` leaves it alone)                        |

About 290,000 instructions per run against Shopify's 11 million limit.

## Going live

Built and tested here; not yet on the store. It needs `shopify app deploy`
from `apps/shopify-app`, installing the app on the store, and turning the
validation on under **Settings → Checkout → Checkout rules**.
