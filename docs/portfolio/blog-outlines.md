# Blog post outlines

> Drafts. Each outline is built from something that actually happened in this
> project, includes a thing that went wrong first, and ends on the caveat.

## 1. One set of design tokens for Tailwind on web and NativeWind on a phone

- **Hook:** sharing a Tailwind config between Next.js and React Native sounds
  like one import. It isn't.
- **Got wrong first:** the stable NativeWind only supports Tailwind v3, so
  sharing meant a preview release, and a preview's dependency (`lightningcss`)
  broke only at Metro bundle time, never at install.
- **What works:** one TypeScript token source that generates the CSS each
  surface reads (ADR 0003, ADR 0004), checked in CI for drift.
- **Code to show:** `packages/tokens`, the drift check in
  `.github/workflows/ci.yml`.
- **Caveat:** it rests on a pre-release library; the fallback (generating two
  formats) is still on record.

## 2. What a page view costs: nearly pausing a site on a free plan

- **Hook:** the visitors weren't the problem; the test setup was.
- **Got wrong first:** every PR built a preview and ran 50 browser tests and
  9 Lighthouse runs against it, about 270 previews in ten days. Then Next.js
  prefetched every product link that scrolled into view: 36 requests to show
  one collection page.
- **What works:** previews only for changes that can affect the site;
  prefetch on intent (mouse hover, keyboard focus, never touch).
- **Code to show:** `apps/web/components/link.tsx` (#171), the measured before/after
  table.
- **Caveat:** CI that measures its own cost is still missing.

## 3. Headless Shopify subscriptions with Recharge

- **Hook:** the cart has to be modelled before the subscription UI, or it
  sells plans that never renew.
- **Got wrong first:** seed selling plans that check out and never charge;
  three plans at one price; free delivery that renewals charged for.
- **What works:** app-owned plans only, prices from Shopify's allocations, the
  customer portal through a Worker (designed; in review), blend details in line properties (SHO-84: editable
  after purchase, and kept through a variant swap).
- **Code to show:** `hasOwningApp`, the Worker's subscription actions.
- **Caveat:** a property update replaces the whole list; repricing on a swap
  still needs checking.

## 4. Parallel agent development with Linear and git worktrees

- **Hook:** many changes at once is easy; landing them together is the work.
- **Got wrong first:** merging branches with `-X ours` silently duplicated
  code; a batch of ~100 PRs sat unmerged while production ran untested code
  (a 404 front page, an unannounced framework flaw).
- **What works:** one worktree per branch, stacked PRs, `git rerere` to replay
  conflict resolutions, an automated reviewer on every PR plus human review,
  and checks that catch what typecheck doesn't (route parity, copies of
  constants).
- **Code to show:** the walk that brought 20 stacked PRs up to date.
- **Caveat:** the ceiling is review and merge, not writing code: the batch
  still has to land.
