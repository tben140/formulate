# Surface: web storefront

`apps/web` — Next.js 16, App Router, Tailwind v4, deployed to Vercel.

## Stack

|           |                                                                       |
| --------- | --------------------------------------------------------------------- |
| Framework | Next.js 16, App Router                                                |
| Rendering | React Server Components — every Storefront query runs on the server   |
| Styling   | Tailwind v4, consuming `@formulate/tokens/theme.css`                  |
| Images    | `next/image`, with `cdn.shopify.com` allow-listed in `next.config.ts` |
| Hosting   | Vercel, with Web Analytics and Speed Insights                         |

## Routes

| Route                   | What it does                             |
| ----------------------- | ---------------------------------------- |
| `/`                     | Redirects to `/collections/best-sellers` |
| `/collections/[handle]` | Product grid                             |
| `/products/[handle]`    | Product detail with variants             |

The homepage is a redirect rather than a page. This is the one place where the
web app and the Liquid theme deliberately diverge in structure: a theme's
homepage is a real, merchant-editable page, so `apps/theme` renders the
collection through a `featured-collection` section instead of redirecting. Both
land the visitor on the same products.

## Data access

`lib/storefront.ts` constructs the shared client from **server-only** environment
variables:

```
SHOPIFY_STORE_DOMAIN
SHOPIFY_STOREFRONT_TOKEN
SHOPIFY_API_VERSION
```

Note the absence of a `NEXT_PUBLIC_` prefix. That is deliberate and load-bearing:
because every query runs in a Server Component, the token has no reason to reach
the browser, so it never does. The mobile app has to make the opposite choice —
see [ADR 0006](adr/0006-checkout-handoff-differs-per-surface.md) for the wider
pattern of surfaces diverging where the platform genuinely differs.

There is no client-side query cache. React Server Components already fetch on the
server per request, so TanStack Query would be a second caching layer solving a
problem the framework has already solved. TanStack lives in `apps/mobile` only.

## Error handling

`packages/shopify`'s `request()` returns a `StorefrontResult<T>` discriminated
union rather than throwing. The web app narrows it and renders
`components/storefront-error.tsx` on failure, so a bad token produces a readable
page instead of a stack trace.

## Build

Workspace packages ship raw TypeScript rather than a build output, and
`transpilePackages` in `next.config.ts` lets Next compile them directly. That is
what keeps `@formulate/shopify` and `@formulate/tokens` free of a build step —
and therefore free of a Turbo dependency edge.

## Deployment

Vercel is linked to the repository with `apps/web` as the root directory.

- `vercel.json` sets `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`.
- `.vercelignore` exists at the repository root because the Vercel CLI does not
  fully respect `.gitignore` when uploading. A root-level `vercel deploy` tried
  to upload 18,919 files (584 MB), almost all `node_modules`, and hit the
  15,000-file limit. Git-triggered deployments never saw this, because Vercel
  clones from GitHub and only sees tracked files.
- `turbo.json` includes `VERCEL` in the `build` task's `env`, so a locally
  produced build is never reused for a Vercel build where the environment
  genuinely differs.

### Analytics

`<Analytics />` and `<SpeedInsights />` are mounted in `app/layout.tsx`, after
the footer, so they never sit between semantic landmarks. Both render `null`
outside Vercel, so local dev and CI are unaffected.

Scope worth stating: Vercel Analytics is page views and Core Web Vitals measured
at the edge, cookieless. It is **not** product analytics, and it cannot see the
Expo app at all.

### Performance monitoring

Two sources, measuring different things:

- **Lab: Lighthouse CI** (`.github/workflows/lighthouse-web.yml`, config in
  `apps/web/lighthouserc.cjs`). Runs against every Vercel deployment once
  Vercel reports it ready, and weekly against production. Mobile profile, three
  runs per page, median judged. The table and full reports land on the
  workflow run.
- **Field: Vercel Speed Insights.** Real visitors' LCP, CLS and INP. Lab data
  has no INP, so Lighthouse gates on Total Blocking Time instead.

Previews are behind Vercel Deployment Protection, so the workflow needs the
`VERCEL_AUTOMATION_BYPASS_SECRET` repository secret (Vercel → Project →
Settings → Deployment Protection → Protection Bypass for Automation). The
secret goes on the query string, never in Lighthouse's `extraHeaders`, which
would send it to every third-party host the page loads from. It is redacted
from the reports before they are uploaded.

#### Perf snapshot

Budgets are generous on purpose: for now the gate only has to exist and catch
a regression. They ratchet at phase exit (SHO-68).

| Metric | Budget (error) | Baseline, 28 Sep 2026 |
| --- | --- | --- |
| Performance score | ≥ 50 | 57–73 |
| Accessibility score | ≥ 95 | 100 |
| LCP | ≤ 6.0 s | 2.9–5.2 s |
| CLS | ≤ 0.1 | 0.000 |
| TBT | ≤ 1200 ms | 360–1025 ms |

The baseline comes from a production build of the combined September PR batch,
measured on the development droplet. That machine is a shared CPU, so TBT
varies about twofold between runs, and the budget allows for it. LCP is the
metric to watch: on both pages the LCP element is a product image with
`loading="lazy"`, which delays the most important image on the page.

#### LCP, 4 Oct 2026 (SHO-148)

⚠️ **Lighthouse's default simulated throttling overstates LCP here, by about
1.5 s.** It loads the page unthrottled, then models a slow phone from that trace.
Unthrottled, the JavaScript arrives from our host before the image arrives from
Shopify's CDN, so the scripts run before the image paints, and the model counts
every one of them as blocking it. That is the "2.2–2.7 s render delay" SHO-148
was opened for. With real throttling (`--settings.throttlingMethod=devtools`,
the same 4× CPU and slow 4G), render delay is 50–130 ms. The time goes on
**downloading** the image, not on painting it.

The fix that moved the real number was the first row: an eager image is also
preloaded in `<head>` (React 19 does this), so the collection's three eager
images raced each other and the JavaScript on a phone, where one is on screen.
Now only the first result is eager, on collections and search (search had none,
the bug SHO-143 fixed on collections).

Mobile, median of 3–5 runs, production build on the droplet:

| Page | Real throttling, before | Real throttling, after | Simulated (CI's method), after |
| --- | --- | --- | --- |
| Collection | 2.81 s | **2.20 s** | 3.5 s |
| Product | 1.93 s | 1.92 s | 3.7 s |
| Search | 2.92 s | **1.98 s** | — |
| Home (LCP is the heading) | 1.61 s | 1.61 s | — |

Desktop collection LCP is 0.7–0.9 s with real throttling; the lazy cards start
about 200 ms after the first. All four pages are under the 2.5 s "good"
threshold in real conditions. Field data (Speed Insights) is the arbiter; the
lab budget stays on the simulated number CI produces.

## Not built yet

Cart, checkout, customer accounts, and the read-only Recharge portal. Cart is
first, and everything else waits on it — see the
[domain model's cart section](domain-model.md#cart) for the persistence design
and the `?key=` trap.

## Related

- [Architecture](architecture.md) · [Mobile app](surface-mobile.md) · [Liquid theme](surface-theme.md)
- [`apps/web/AGENTS.md`](../apps/web/AGENTS.md)
