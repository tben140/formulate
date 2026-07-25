# Formulate

A headless Shopify storefront as a Turborepo monorepo: a Next.js web app, an Expo
React Native app, and a shared data + design-token layer between them.

## Structure

```
apps/
  web/          Next.js 16 · App Router · Tailwind v4 · deploys to Vercel
  mobile/       Expo SDK 57 · Expo Router · NativeWind v5 · builds via EAS
packages/
  shopify/      Storefront API client, query documents, generated types
  tokens/       Design tokens (TS source) → generated Tailwind v4 @theme CSS
  eslint-config/
  typescript-config/
```

## The one architectural rule

**`packages/shopify` must stay platform-neutral.** Both apps import it, so it
uses bare `fetch` and has no Shopify runtime dependency — nothing DOM-flavoured.
Web-only ergonomics (`@shopify/hydrogen-react`'s `<Image>`) live in `apps/web`.

`@shopify/hydrogen-react` *is* a devDependency of `packages/shopify`, but only
for codegen: it ships the Storefront GraphQL schema as a local JSON file, so
type generation runs offline with no credentials and no network call.

## Data fetching differs by platform, deliberately

| | Web | Native |
|---|---|---|
| Fetching | React Server Components | TanStack Query |
| Token env var | `SHOPIFY_*` (server-only) | `EXPO_PUBLIC_SHOPIFY_*` |

The web app never sends its token to the browser because every query runs on the
server. The Expo bundle *is* the client, so its token ships with the app — which
is exactly what a public Storefront access token is designed for.

⚠️ The Admin API token must never appear in any package. Anything Admin-flavoured
belongs behind a Next.js route handler.

## Setup

```bash
pnpm install
```

Create a Storefront access token (Shopify admin → add the **Headless** sales
channel → create a storefront → publish products to it), then:

```bash
cp .env.example apps/web/.env.local
```

Fill in `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN`, and mirror them
into `apps/mobile/.env.local` with the `EXPO_PUBLIC_` prefix. Both files are
gitignored; this repository is public.

Confirm the credential works before starting either app:

```bash
pnpm --filter @formulate/shopify smoke
```

## Commands

```bash
pnpm web          # Next.js dev server on :3000
pnpm mobile       # Expo dev server
pnpm lint         # ESLint across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm build        # Next build + Expo export
pnpm codegen      # Regenerate Storefront types from the query documents
```

After editing `packages/shopify/src/queries.ts`, run `pnpm codegen` and commit
the result — CI fails if the generated output has drifted.

After editing `packages/tokens/src/tokens.ts`, run
`pnpm --filter @formulate/tokens build` to regenerate `theme.css`. Never edit
that file by hand.

## Known version constraints

These are load-bearing. Read the comments before changing them.

- **`lightningcss` is pinned to `1.30.1`** in `pnpm-workspace.yaml`. NativeWind v5
  deserialises lightningcss output in `react-native-css`, and any newer version
  fails at Metro bundle time — never at install time.
- **TypeScript is pinned to `~6.0.3`, not 7.** No `typescript-eslint` release
  supports TypeScript 7 (all cap at `<6.1.0`), and its parser is what lets
  ESLint read TypeScript at all. 6.0.3 is the sweet spot: inside that range and
  exactly what Expo SDK 57 expects. Note TS 6 deprecates `baseUrl`, so the app
  tsconfigs use `paths` alone.
- **React is pinned to `19.2.3` workspace-wide** via a pnpm override, because
  that is the version Expo SDK 57 expects. Under the hoisted node linker a
  second React copy would break hooks in the Expo app.
- **React version is declared explicitly** in `packages/eslint-config/react-native.js`.
  `eslint-plugin-react` 7.37.x crashes on ESLint 10 during version *detection*.
- **NativeWind v5 is pre-release** (`5.0.0-preview.4`), chosen so both apps share
  one Tailwind v4 token file. The fallback is NativeWind v4 + Tailwind v3 in
  `apps/mobile` only.
