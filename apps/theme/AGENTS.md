# AGENTS.md — apps/theme

Rules specific to the Liquid theme. The root [`AGENTS.md`](../../AGENTS.md)
applies as well; this file only records what is different here.

Background: [`docs/surface-theme.md`](../../docs/surface-theme.md).

## There is no build step, and that is the design

Shopify CLI serves `assets/` as-is. Horizon — Shopify's own theme — ships 81
JavaScript files with no `package.json` and no `tsconfig`, and this theme matches
that.

Consequences you must not quietly undo:

- **Do not add a bundler.** No Vite, no esbuild, no rollup. Bare specifiers like
  `@theme/component` are resolved by a **browser import map**, not a module
  graph.
- **Do not write TypeScript.** Types come from **JSDoc**, checked by
  `tsc --noEmit --checkJs`. This gives real type safety, including generics, while
  shipping plain JavaScript that needs no compilation.
- **`assets/tokens.css` is committed and generated.** Never hand-edit it.
  Regenerate with `pnpm --filter @formulate/theme build`, which copies the output
  of `packages/tokens`. It is committed so `shopify theme dev` works for anyone
  who never runs this repository's tooling — that is a requirement, not an
  oversight.

## Every Shopify CLI command needs `--path .`

Without it the CLI walks up to the monorepo root looking for a theme. Theme check
then inspects 183 files and reports existing assets as missing. Every script in
`package.json` already carries the flag; keep it on anything new.

`@shopify/cli` is a **devDependency**, pinned to 4.6.0. Do not rely on a global
Homebrew install — a clean CI runner has none, and that turned CI red once
already. `pnpm` places the local `node_modules/.bin` first on `PATH`, so scripts
resolve the pinned binary.

## The storefront password

Development stores are **always** password protected. "Restrict access to
visitors with the password" is greyed out and cannot be disabled until the store
moves to a paid plan or is transferred to a merchant.

So `dev`, `push` and `pull` all need `SHOPIFY_FLAG_STORE_PASSWORD`, which the CLI
reads from the process environment but does not load from `.env` files for theme
commands. `scripts/with-env.sh` loads `apps/theme/.env.local` and then `exec`s the
command.

- ⚠️ **Never type the password into a CLI flag, a file, or a form.** It goes in
  the gitignored `.env.local` only, and the user puts it there.
- **`lint` deliberately does not use the wrapper.** Theme check is static and
  needs no store access, so CI stays secret-free. Do not wrap it.

## Web components

`assets/component.js` is the base class. Two things it provides, both worth
preserving:

1. **Ref collection**, which **skips refs belonging to nested components**.
   Without that check a nested component silently steals its parent's refs and
   both break.
2. **An `AbortSignal` tied to element lifetime**, so listeners clean themselves
   up and `disconnectedCallback` stays a one-liner. Use it — do not hand-remove
   listeners.

`noImplicitOverride` is on, so `connectedCallback` and friends need an
`@override` JSDoc tag when overriding the base class.

Everything is **progressive enhancement**. The first product image renders with
no JavaScript at all. A component that leaves the page broken until it hydrates
is not acceptable here.

## Styling

Every value must resolve to a custom property from `assets/tokens.css`. A literal
colour or spacing value in a `{% stylesheet %}` block is a token that should
exist — add it to `packages/tokens/src/tokens.ts`, which also moves the other two
surfaces.

Two Liquid-specific constraints:

- **A snippet cannot own a `{% stylesheet %}` block.** Styles for shared snippets
  (`snippets/product-grid.liquid`) live in `assets/critical.css`.
- **`.container` needs `width: 100%`.** Shopify wraps sections in
  `.shopify-section`, styled `display: grid`, and a grid child with
  `margin-inline: auto` and `width: auto` shrinks to fit its content rather than
  filling then capping. Removing `width: 100%` collapses narrow pages to a
  content-width column while wide pages keep looking correct — so it fails
  silently in exactly the places nobody checks.

For schema-driven styling, follow the skeleton's convention: single CSS property
→ a CSS variable set inline from `block.settings`; multiple properties → a
modifier class.

## Parity

Layout values are matched against `apps/web`, verified rather than eyeballed:
container 1024px, padding-inline 16px, padding-block 32px, nav 16px, wordmark
18px/600, border 1px `#e2e8f0`.

The theme **does not use `packages/shopify`.** Data comes from Liquid,
server-side. Do not add client-side Storefront API calls to fetch what
`collection.products` already provides — see
[ADR 0005](../../docs/adr/0005-parity-means-design-not-data.md).

That ADR also explains why this surface shows **6** products where web and mobile
show 7. It is sales-channel publication, not drift. Do not "fix" it.

## Verification

`shopify theme check` must report **no offenses**.

For anything visual, look at the rendered page. A gallery bug shipped here with a
completely correct DOM — right buttons, right positions, right ARIA — and was
only visible in the pixels: unselected thumbnails had a transparent border, so on
white product photography they were indistinguishable from the background.
