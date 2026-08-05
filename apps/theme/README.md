# @formulate/theme

A Shopify Online Store theme — the third surface in this monorepo, alongside the
Next.js and Expo storefronts.

Built on Shopify's `theme init` skeleton and following the architecture of
Shopify's own **Horizon** theme: web components, no bundler, no build step, types
from JSDoc.

- Design notes: [`docs/surface-theme.md`](../../docs/surface-theme.md)
- Working rules: [`AGENTS.md`](AGENTS.md)

## Commands

Run from anywhere in the repository:

```bash
pnpm --filter @formulate/theme lint      # shopify theme check
pnpm --filter @formulate/theme build     # regenerate assets/tokens.css
pnpm --filter @formulate/theme dev       # local preview against the store
pnpm --filter @formulate/theme push      # push as an unpublished theme
pnpm --filter @formulate/theme pull      # pull the live theme
```

Every script passes `--path .`. Without it the Shopify CLI walks up to the
monorepo root, and theme check inspects 183 files while reporting existing assets
as missing.

`lint` needs no store access, which is what keeps CI free of secrets. `dev`,
`push` and `pull` go through `scripts/with-env.sh`.

## Setup

`dev`, `push` and `pull` need the storefront password, because development stores
are permanently password protected — the "Restrict access" setting is greyed out
until the store moves to a paid plan.

```bash
cp .env.local.example .env.local
```

Then fill in `SHOPIFY_FLAG_STORE_PASSWORD`. The file is gitignored; this
repository is public.

## Structure

```
assets/     tokens.css (generated), critical.css, component.js, media-gallery.js
blocks/     Nestable theme blocks
config/     Theme settings schema and data
layout/     theme.liquid, password.liquid
locales/    Translations
sections/   Full-width page components
snippets/   Reusable Liquid fragments
templates/  JSON templates composing the sections
```

## Three things that will surprise you

**There is no build step, deliberately.** Shopify CLI serves `assets/` as-is.
`assets/tokens.css` is generated from `packages/tokens` but **committed**, so
`shopify theme dev` works for anyone who never runs this repository's tooling.
Regenerate it with `build`; never edit it by hand.

**JavaScript, not TypeScript, but still typechecked.** Types come from JSDoc,
enforced by `tsc --noEmit --checkJs`. Bare specifiers like `@theme/component` are
resolved by a browser import map rather than a bundler.

**This surface shows 6 products where web and mobile show 7.** That is
sales-channel publication, not drift — one product is published to Headless but
not to the Online Store. See
[ADR 0005](../../docs/adr/0005-parity-means-design-not-data.md).

## Attribution

Scaffolded from [Shopify's skeleton theme](https://github.com/Shopify/skeleton-theme),
MIT licensed. The `shoppy-x-ray.svg` asset comes from that project.
