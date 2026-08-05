# Surface: Liquid theme

`apps/theme` — a Shopify Online Store theme, built on the `shopify theme init`
skeleton and following the architecture of Shopify's own Horizon theme.

## Why a Liquid theme at all

The other two surfaces are headless. This one exists to demonstrate the skill
most Shopify work actually asks for, and to make a point that only three surfaces
can make: **the design system holds across rendering models it was never
specialised for.**

It is also the surface that proves the token pipeline is real rather than
decorative. Liquid has no Tailwind and no bundler, so it cannot consume the
`@theme { … }` block the React surfaces use — which is why
`packages/tokens/scripts/build-css.ts` emits a second `:root { … }` file from the
same declaration list.

## Approach: no build step

The theme has **no bundler**. Shopify CLI serves `assets/` as-is, and Horizon
ships 81 JavaScript files with no `package.json` and no `tsconfig`. This matches
that.

Consequences, all intentional:

- `assets/tokens.css` is **committed**, not generated at deploy time. Anyone can
  clone the repository and run `shopify theme dev` without ever touching pnpm.
  `scripts/sync-tokens.mjs` only exists to regenerate it.
- Types come from **JSDoc**, enforced by `tsc --noEmit --checkJs`. Real type
  safety, including generics, with nothing but plain JavaScript shipped.
- Bare specifiers such as `@theme/component` are resolved by a **browser import
  map** rather than a bundler, so module load order stops mattering.

## Structure

```
assets/     tokens.css (generated), critical.css, component.js, media-gallery.js
blocks/     group, text — nestable theme blocks
config/     settings_schema.json, settings_data.json
layout/     theme.liquid, password.liquid
locales/    en.default.json, en.default.schema.json
sections/   header, footer, collection, product, featured-collection, …
snippets/   product-grid, image, meta-tags, css-variables, scripts
templates/  JSON templates composing the sections
```

## Web components

`assets/component.js` is a deliberately small base class. It provides two things:

1. **Ref collection** — declaratively named child elements, gathered once.
2. **An `AbortSignal` tied to element lifetime**, so listeners clean themselves
   up and `disconnectedCallback` stays a one-liner.

It skips refs belonging to _nested_ components. Without that check, a component
inside another silently steals the parent's refs and both break.

`assets/media-gallery.js` is the first real component: product image switching
with a **roving tabindex**, so the thumbnail strip is a single tab stop with
arrow-key navigation rather than forcing a keyboard user through every thumbnail
in sequence. Progressive enhancement throughout — the first image renders with no
JavaScript at all.

### A bug worth remembering

Unselected thumbnails were `border: 2px solid transparent`. That reserves layout
space so selection changes cannot shift the strip — correct — but leaves the
resting state with no visible affordance. Product photography is commonly shot on
white, so on a white page the unselected thumbnails were indistinguishable from
the background, and a buyer could not tell other images existed.

The DOM was entirely correct throughout: three buttons, right positions, images
loaded, ARIA accurate. **Only looking at the rendered pixels showed it.** The fix
was a resting border of `--color-border`, still 2px, preserving the
no-layout-shift property.

## Data access

Liquid, server-side. `collection.products`, `product.variants`. This surface
deliberately does **not** use `packages/shopify`.

Fetching the same data over the Storefront API from the browser would be slower,
worse for SEO, and simply the wrong shape for a theme. See
[ADR 0005](adr/0005-parity-means-design-not-data.md), which also explains why
this surface shows **6** products where web and mobile show 7.

## Layout parity

Verified against `apps/web`'s Tailwind values rather than eyeballed:

|                     | Value         | Tailwind equivalent     |
| ------------------- | ------------- | ----------------------- |
| Container max-width | 1024px        | `max-w-5xl`             |
| Padding inline      | 16px          | `px-4`                  |
| Padding block       | 32px          | `py-8`                  |
| Nav padding block   | 16px          | `py-4`                  |
| Wordmark            | 18px / 600    | `text-lg font-semibold` |
| Border              | 1px `#e2e8f0` | `border-border`         |

One layout bug this exposed is worth recording. `.container` needs `width: 100%`.
Shopify wraps sections in `.shopify-section`, which the skeleton styles as
`display: grid`, and **a grid child with `margin-inline: auto` and `width: auto`
shrinks to fit its content** rather than filling then capping. Wide pages looked
correct by accident; the 404 page collapsed to a 167px centred column.

## Commands

All Shopify CLI scripts pass `--path .`. Without it the CLI walks up to the
monorepo root, and theme check inspects 183 files, reporting existing assets as
missing.

```bash
pnpm --filter @formulate/theme lint     # shopify theme check — no store access needed
pnpm --filter @formulate/theme build    # regenerate assets/tokens.css
pnpm --filter @formulate/theme dev      # shopify theme dev  (needs the password)
pnpm --filter @formulate/theme push     # shopify theme push --unpublished
```

`dev`, `push` and `pull` go through `scripts/with-env.sh`, which loads
`apps/theme/.env.local` and then `exec`s the command. `lint` deliberately does
not: theme check is static and needs no store access, so CI stays secret-free.

### Why the password wrapper exists

Development stores are **always** password protected. "Restrict access to
visitors with the password" is greyed out and cannot be disabled until the store
moves to a paid plan or is transferred to a merchant. Every CLI command that
renders the storefront therefore needs `SHOPIFY_FLAG_STORE_PASSWORD`, and the CLI
reads it from the process environment but does not load `.env` files for theme
commands.

It lives in `apps/theme/.env.local` rather than a shell profile because the
password belongs to _one store_, not to a machine. A shell profile would make it
global state leaking into every project, and would need permanently excluding
from synced dotfiles.

## Scope

Read-only browse, matching the other two surfaces. No add-to-cart yet — cart
lands across all three together.

Cart and account icons were deliberately **removed** from the header. All three
surfaces stop at read-only browse for now, and an icon leading to an unbuilt
experience is worse than no icon.

## Not built yet

Cart drawer (AJAX Cart API), add-to-cart, Klaviyo onsite tracking.

## Related

- [Architecture](architecture.md) · [Web storefront](surface-web.md) · [Mobile app](surface-mobile.md)
- [`apps/theme/AGENTS.md`](../apps/theme/AGENTS.md)
