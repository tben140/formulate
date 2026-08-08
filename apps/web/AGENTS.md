# AGENTS.md — apps/web

Rules specific to the Next.js storefront. The root [`AGENTS.md`](../../AGENTS.md)
applies as well; this file only records what is different here.

Background: [`docs/surface-web.md`](../../docs/surface-web.md).

## Server-first, by default

Every Storefront query runs in a **React Server Component**. That is not
incidental — it is why the Storefront token never reaches the browser.

- Do not add `"use client"` to reach for a hook when a Server Component can do
  the work. Push client boundaries as far down the tree as they will go.
- Do not introduce TanStack Query or any client-side fetching cache. RSC already
  fetches per request on the server; a second cache layer solves a problem the
  framework has solved. TanStack lives in `apps/mobile` and belongs there.

## Environment variables

```
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_TOKEN
SHOPIFY_API_VERSION
```

⚠️ **Never add a `NEXT_PUBLIC_` prefix to any of these.** The prefix inlines the
value into the client bundle. Nothing in this app needs the token client-side,
and adding the prefix would ship a credential for no reason.

If a future feature genuinely needs Shopify data in the browser, route it through
a Server Action or a route handler rather than exposing the token.

The Admin API token must never appear in this app at all — see the root
`AGENTS.md`.

Local values go in `apps/web/.env.local` (gitignored). `packages/shopify`'s smoke
test reads the same file:

```bash
pnpm --filter @formulate/shopify smoke
```

## Errors

`request()` returns `StorefrontResult<T>`, a discriminated union — it does not
throw for expected failures. Narrow it and render
`components/storefront-error.tsx`. Do not wrap calls in `try`/`catch` and do not
throw the error onward to an error boundary; the point of the Result type is that
a bad token produces a readable page.

## Styling

Tailwind v4, consuming `@formulate/tokens/theme.css`.

Use token-backed utilities (`text-foreground-muted`, `border-border`,
`max-w-5xl`) rather than raw values. A hex code or arbitrary value in a class name
is a token that should exist — add it to `packages/tokens/src/tokens.ts` instead,
which also moves the other two surfaces.

Layout values are matched against the Liquid theme deliberately: `max-w-5xl`,
`px-4`, `py-8`, nav `py-4`. Changing one without the other breaks parity.

## Routing

`app/page.tsx` redirects `/` to the default collection. This is the one
deliberate structural divergence from the theme, which renders a real homepage
section instead — see
[ADR 0005](../../docs/adr/0005-parity-means-design-not-data.md). Do not
"fix" either side to match the other.

Route files export via `export { X as default }`, matching the workspace's
named-export convention.

## Build

`next.config.ts` lists `transpilePackages` for the workspace packages, because
they ship raw TypeScript rather than a build output. Adding a new workspace
dependency means adding it there too.

`cdn.shopify.com` is the only allowed remote image host.

## Klaviyo

Events go to `window._learnq`, **never** to `window.klaviyo`. The latter is
owned by `klaviyo.js`; assigning an array to it shadows the object the script
installs, and every event lands somewhere nothing drains — silently.

Two things make this integration hard to verify, and both look like broken code:

- **Klaviyo does not transmit events for anonymous visitors.** They are cached
  in the browser until a profile is identified. So email capture is a
  dependency of demonstrating anything, not a follow-on.
- ⚠️ **It cannot be verified over plain HTTP.** Klaviyo derives its API URLs
  from the page protocol, so on `next dev` the profile call goes to
  `http://a.klaviyo.com` and fails while events still return 202. Test on a
  deployed HTTPS origin.

- ⚠️ **Never test with an `@example.com` address.** Klaviyo silently discards
  addresses it judges fake — `@example.com`, `@test.com`, anything containing
  `test`, `invalid` or `fake` — and still returns `202`. There is no public
  list of the patterns. Notably the **server-side** Shopify sync does not apply
  this filter, so the account can be full of `@example.com` profiles from
  seeded orders while every client-side attempt at the same domain vanishes.

`202` means _validated and queued_, never _recorded_. Nothing in the response
ever tells you an event was dropped.

See [`docs/integration-klaviyo.md`](../../docs/integration-klaviyo.md).

## Vercel

- The Vercel project's root directory is `apps/web`.
- `vercel.json` sets security headers; keep them.
- `<Analytics />` and `<SpeedInsights />` are mounted last in `app/layout.tsx`,
  after the footer, so they never sit between semantic landmarks. Both render
  `null` outside Vercel.
- `.vercelignore` at the repository root exists because the Vercel CLI does not
  fully respect `.gitignore` when uploading. Do not delete it.
