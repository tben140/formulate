# Architecture

One Shopify store, three storefronts, one design system. This note explains what
that actually means and — more usefully — where the three surfaces are allowed to
disagree.

## The shape

```
apps/
  web/      Next.js 16 · App Router · React Server Components → Vercel
  mobile/   Expo SDK 57 · Expo Router · TanStack Query        → EAS / device
  theme/    Liquid · web components · no bundler              → Shopify Online Store

packages/
  shopify/            Storefront API client, query documents, generated types
  tokens/             Design tokens in TypeScript → generated CSS for both worlds
  eslint-config/
  typescript-config/
```

Turborepo + pnpm workspaces, with `node-linker=hoisted` in `.npmrc` because
Metro cannot resolve pnpm's default symlinked layout.

## The one rule that matters

**`packages/shopify` must stay platform-neutral.** Both React surfaces import it,
so it uses bare `fetch` and has no DOM or React Native dependency. Web-only
ergonomics — `@shopify/hydrogen-react`'s `<Image>`, for instance — live in
`apps/web`.

`@shopify/hydrogen-react` _is_ a devDependency of `packages/shopify`, but only
for codegen: it ships the Storefront GraphQL schema as a local JSON file, so type
generation runs offline, with no credentials and no network call.

## What the surfaces share, and what they don't

|               | Web                             | Mobile                          | Liquid theme                    |
| ------------- | ------------------------------- | ------------------------------- | ------------------------------- |
| Design tokens | `theme.css` (Tailwind `@theme`) | `theme.css` (Tailwind `@theme`) | `assets/tokens.css` (`:root`)   |
| Data access   | `packages/shopify`              | `packages/shopify`              | Liquid objects, server-rendered |
| Fetching      | React Server Components         | TanStack Query                  | None — Liquid runs on Shopify   |
| Token env var | `SHOPIFY_*` (server-only)       | `EXPO_PUBLIC_SHOPIFY_*`         | n/a                             |
| Checkout      | Redirect to `checkoutUrl`       | Checkout Sheet Kit (native)     | Shopify's own checkout          |
| UI components | Not shared                      | Not shared                      | Not shared                      |

Three things are worth pulling out of that table.

**The theme does not use `packages/shopify`, on purpose.** Liquid already has the
data server-side via `collection.products` and `product.variants`. Fetching the
same data over the Storefront API from the browser would be slower, worse for
SEO, and simply the wrong shape for a theme. See
[ADR 0005](adr/0005-parity-means-design-not-data.md).

**Design tokens are generated twice from one source.**
`packages/tokens/src/tokens.ts` is the only place a colour is written down.
`scripts/build-css.ts` emits the same declarations into a Tailwind v4 `@theme`
block for the React surfaces and a plain `:root` block for the theme. The
declaration list is built once and shared by both writers, so the two outputs
cannot drift.

**UI components are deliberately not shared.** A React Native `<View>` and a
Liquid `<div>` are not the same thing, and forcing an abstraction over three
rendering models produces something that fits none of them well. Parity is
enforced at the token layer and verified by measuring rendered output, not by
sharing component code.

## Where the token pipeline goes

```
packages/tokens/src/tokens.ts          ← the only source of truth
        │
        ├── theme.css   (@theme { … })  → apps/web, apps/mobile via Tailwind v4
        └── tokens.css  (:root { … })   → copied into apps/theme/assets/tokens.css
```

The theme's copy is **committed**, so `shopify theme dev` and `shopify theme push`
work for anyone who never runs this repository's tooling. Regenerate it with
`pnpm --filter @formulate/theme build`; never hand-edit either output.

## Environment and secrets

The repository is public. Nothing secret is committed.

| File                     | Used by                                                  | Committed |
| ------------------------ | -------------------------------------------------------- | --------- |
| `apps/web/.env.local`    | Next.js, and the `packages/shopify` smoke test           | No        |
| `apps/mobile/.env.local` | Expo (`EXPO_PUBLIC_` prefix)                             | No        |
| `apps/theme/.env.local`  | `shopify theme dev/push/pull`, via `scripts/with-env.sh` | No        |
| `.env.example`           | Documentation                                            | Yes       |

The Storefront access token is _public by design_ — it ships inside the Expo
bundle, which is exactly what that credential is for. The **Admin** API token is
a different matter and must never appear in any package; anything Admin-flavoured
belongs behind a Next.js route handler.

The development store is permanently password-protected. "Restrict access to
visitors with the password" is greyed out and cannot be disabled until the store
moves to a paid plan or is transferred to a merchant, so every Shopify CLI
command that renders the storefront needs `SHOPIFY_FLAG_STORE_PASSWORD`.

## CI

`turbo lint typecheck build` runs across the whole workspace on every pull
request, and branch protection requires it to pass on an up-to-date branch.

Two failures are worth remembering, because both passed locally and broke on a
clean runner:

- `expo-env.d.ts` is generated by Expo and gitignored by Expo's own template. It
  supplies the `*.css` module declaration. A fresh clone has never run an Expo
  command, so typecheck failed. Fixed by adding the same reference directive to
  the committed `nativewind-env.d.ts`.
- `@shopify/cli` existed only as a global Homebrew install. `@formulate/theme:lint`
  invokes `shopify theme check`, so a clean runner had no binary. Fixed by adding
  the CLI as a devDependency, pinned to the version the theme was verified against.

The shared lesson: **passing locally proves nothing if the thing making it pass
lives outside the repository.**

## Related

- [Domain model](domain-model.md)
- [Decision records](adr/README.md)
- Surfaces: [web](surface-web.md) · [mobile](surface-mobile.md) · [theme](surface-theme.md)
