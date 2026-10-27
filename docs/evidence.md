# Evidence

Numbers behind the claims in the [README](../README.md) and the
[case study](case-study.md), each with where it came from. Where a target was
missed, or a check doesn't exist yet, it says so.

Collected 2026-10-05. Refresh at each phase exit (SHO-80); the Lighthouse
report links from Shopify's action expire after a few days, so the numbers are
copied here.

## Performance (Lighthouse)

### Web, CI on a Vercel preview

Mobile profile, simulated throttling (Lighthouse's default), median of three
runs. [Run 37337890926](https://github.com/tben140/formulate/actions/runs/37337890926)
on `910015f`, the integration branch plus docs.

| Page                            | Performance | Accessibility | LCP    | TBT   | CLS   |
| ------------------------------- | ----------- | ------------- | ------ | ----- | ----- |
| `/collections/best-sellers`     | 95          | 100           | 2.29 s | 54 ms | 0.002 |
| `/products/magnesium-glycinate` | 97          | 100           | 2.58 s | 50 ms | 0.003 |

Budgets (error): performance ≥ 50, accessibility ≥ 95, LCP ≤ 6.0 s, CLS ≤ 0.1,
TBT ≤ 1200 ms. Generous on purpose, to ratchet at phase exit (SHO-68).

### Web, real throttling (the droplet)

`--settings.throttlingMethod=devtools`, mobile, median of 3–5 runs, production
build. Before and after #60, which loads only the LCP image eagerly. Details
and method in PR #60, which adds them to `surface-web.md`.

| Page       | Before | After  |
| ---------- | ------ | ------ |
| Collection | 2.81 s | 2.20 s |
| Search     | 2.92 s | 1.98 s |
| Product    | 1.93 s | 1.92 s |
| Home       | 1.61 s | 1.61 s |

⚠️ The droplet's shared CPU makes simulated numbers there about 1 s worse than
the same pages on CI (3.5 s against 2.3–2.6 s). Quote CI for simulated numbers
and the droplet only for before/after comparisons on the same machine.

### Theme, CI

Shopify's Lighthouse action, mobile, simulated.
[Run 37339538720](https://github.com/tben140/formulate/actions/runs/37339538720)
on `3091960`.

| Page                            | Performance | Accessibility | LCP        | TBT    | CLS   |
| ------------------------------- | ----------- | ------------- | ---------- | ------ | ----- |
| `/`                             | 90          | 100           | 2.27 s     | 300 ms | 0.015 |
| `/products/magnesium-glycinate` | 84          | 100           | 2.47 s     | 429 ms | 0.008 |
| `/collections/best-sellers`     | 83          | 100           | **3.32 s** | 301 ms | 0.003 |

**Missed:** the theme's collection LCP is over the 2.5 s "good" threshold.
Not yet investigated; the web collection had the same symptom from images
competing (SHO-148).

### App

**Not measured yet.** Cold start, slow and frozen frames, and scroll
performance need a device or simulator: Flashlight on Android, Maestro on iOS,
and Sentry's mobile vitals. The work to do so is tracked in Linear.

## Accessibility

| Surface | Check                                                      | Result                                                                                                                         |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Web     | axe, WCAG 2.2 AA, on every Vercel deployment (`E2E (web)`) | Pass, [run 40222378119](https://github.com/tben140/formulate/actions/runs/40222378119) on the batch at `80dbb57` (25 Oct 2026) |
| Theme   | axe, WCAG 2.2 AA, on a temporary theme per PR (#59)        | 16/16, [run 37212316127](https://github.com/tben140/formulate/actions/runs/37212316127)                                        |
| App     | axe through its web build (#69)                            | Clean on every main screen and sheet: a local run at `d3724d7` (20 Oct 2026), recorded in #69. Not in CI yet                   |

Device-only checks (VoiceOver order, gestures, Dynamic Type) are still manual.

## Tests

Unit coverage at `de630ca` (26 Oct 2026), from
`pnpm --filter <package> test:coverage`. Vitest measures only the files a test
loads, so a file no test imports is missing from the figures, not counted as
0%. What each package leaves out:

- `packages/shopify`: generated code (`src/generated/**`), the codegen config
  and the barrel `src/index.ts`.
- `packages/analytics`: the barrel `src/index.ts`.
- `apps/api`: nothing. Its `src/index.ts` is the Worker itself, and it's
  measured.

| Package                 | Tests | Lines | Branches | Functions |
| ----------------------- | ----- | ----- | -------- | --------- |
| `packages/shopify`      | 101   | 96.3% | 86.6%    | 96.3%     |
| `packages/analytics`    | 50    | 96.6% | 85.7%    | 95.5%     |
| `apps/api` (the Worker) | 20    | 83.8% | 84.6%    | 60.0%     |

**Gaps:**

- **`packages/shopify/src/client.ts` isn't in the figures.** No unit test
  imports it, so Vitest doesn't measure it. It's exercised by the smoke test
  and every end-to-end suite, but not in isolation.
- **There's no enforced coverage threshold.** The "elevated shared-package bar"
  SHO-43 describes doesn't exist yet; these are measurements, not a gate.

End to end, all open PRs combined (2026-10-05, posted on #56):

| Suite                               | Result                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Web (Playwright, desktop and phone) | 75 passed, 5 skipped (desktop-only keyboard tests in the phone project) |
| App (Playwright on Expo web)        | 10 passed                                                               |
| Theme (axe)                         | 16 passed                                                               |
| `turbo lint typecheck test build`   | 21/21                                                                   |

### Since then (2026-10-21, open PRs)

Counted with `vitest run` / `jest` at the commit named; coverage not re-measured.

| Package                   | Tests                          | At                              |
| ------------------------- | ------------------------------ | ------------------------------- |
| `packages/shopify`        | 106                            | `e2876ab` (#139)                |
| `apps/api` (the Worker)   | 84                             | `b52d0c7` (#136)                |
| `packages/recharge`       | 19                             | `b52d0c7` (#136)                |
| `apps/mobile` (Jest)      | 25                             | `5616b9e` (#137), new           |
| `packages/shopify`        | 147                            | `a657266` (#146)                |
| `apps/api` (the Worker)   | 40                             | `ed0ad0f` (#147, on #94's line) |
| `free-gift` Function      | 6 fixtures, run as WebAssembly | `9abf721` (#145), new           |
| `stack-discount` Function | 9 fixtures, run as WebAssembly | `9abf721` (#145)                |
| `packages/shopify`        | 168                            | `3122967` (#148)                |
| Checkout extensions       | 14                             | `a92961b` (#149), new           |

The app's Jest suite (new in #137) was checked against its own bugs: putting
back two issues the reviewer had found on #136, and removing the cart sheet's
"only after a purchase" guard, each turned the matching tests red.

### On the demo store (2026-10-23)

Checked in a browser against the live theme and checkout, not a mock:

- Quick add from a collection card adds the product (cart has 1 item).
- The guarantee link under the product page's button opens the refund
  policy, which states the same 30-day guarantee.
- At checkout the guarantee block shows, and "Subscribe & save 15%" under a
  one-time line switches it to the subscription (£15.95 → £13.56) and Undo
  switches it back.
- Klaviyo: the five v2 flows are live, all consent-filtered; the three they
  replace are drafts again. Shopify's own abandoned-checkout email is off.
- Welcome codes: 500 unique `DH10-` codes. A comparison of both systems' full
  lists found the same 500 in the Shopify discount and the Klaviyo coupon,
  none used.
- An abandoned test checkout reached Klaviyo as "Checkout Started" on a
  profile without consent, which the abandoned-checkout flow correctly skips.

### Merging the two stacks (2026-10-23)

The quiz stack (#125) and the conversion stack (#148) conflict in 12 files,
including the app's navigation (tabs on one side, a new screen on the old
stack on the other). A rehearsal merge on `tben140/premerge-125-148`
typechecks across shared, web and app, passes 198 shared tests and theme lint,
and needed one contract change: `/routine` added to the shared routes.

### Security pass (2026-10-25)

After a month of npm worms and stolen-token attacks, and critical Next.js and
Node.js fixes. Details in [security.md](security.md); PRs #152 and #153.

| Check                                 | Result                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js, batch and production         | **Exposed**: 16.3.8 and 16.2.11 were in range for two critical unauthenticated RCEs (GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw). Fixed by 16.4.2 |
| `pnpm audit`                          | 74 findings (3 critical, 45 high) → 4 (2 high, 2 moderate), all inside Expo's CLI with no fix released                                          |
| This month's compromised npm packages | None in the lockfile (keyv/cacheable family, node-ipc, `@subql/*`, tensorlake)                                                                  |
| Indicators of compromise              | None in git history, `node_modules` or on the droplet                                                                                           |
| GitHub Actions                        | Pinned to tags → pinned to commit SHAs; checkout no longer leaves the token on disk                                                             |
| Gaps                                  | Dependabot alerts off, Renovate never run, any Action allowed: owner settings, tracked in SHO-191                                               |

The audit gate (`pnpm audit --audit-level critical`) runs in CI from #152.

### Security follow-up and Expo SDK 58 (2026-10-26)

| Check                               | Result                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit gates (#159)                  | `pnpm audit` high and critical anywhere, moderate in shipped code: pass, with the 4 known findings accepted by advisory ID and a review date. [Run 40347387622](https://github.com/tben140/formulate/actions/runs/40347387622) at `0c08175` |
| Workflow lint (zizmor 1.31.1, #159) | No findings on any workflow, same run                                                                                                                                                                                                       |
| pnpm trust policy (#159)            | Passes for the whole lockfile with 4 exact-version exceptions, each checked by hand (publisher and date)                                                                                                                                    |
| Dependabot alerts on `main`         | 84 (3 critical, 47 high) once switched on. All 3 critical are fixed on the batch (`shell-quote` overridden to 1.12.0; `tinypool` gone with Vitest 4)                                                                                        |
| Web e2e, batch (production build)   | 41 passed, 7 skipped (desktop-only keyboard tests on the phone project)                                                                                                                                                                     |
| Web e2e, production (`main`)        | 17 failed, 24 passed: colour contrast on purchase options and the cart confirmation, plus layout and keyboard checks, all fixed on the batch                                                                                                |
| Expo SDK 58, droplet (#163)         | `turbo lint typecheck test build` 21/21; web e2e on React 19.3: 43 passed, 7 skipped; the app's web build and iOS bundle build                                                                                                              |
| Expo SDK 58, iPhone (Expo Go)       | Crashed at startup, then failed to load icon fonts: two NativeWind runtime gaps found only on the device (ADR 0003). After both fixes it opened with no errors (Ben, by hand)                                                               |
| Expo SDK 58, native build           | EAS iOS production build 3 (`a58126a3`) finished on 26 Oct and was submitted to TestFlight: #128 + #163                                                                                                                                     |
| TestFlight build 3, iPhone (27 Oct) | Ben, by hand: launch, tabs and the Checkout Kit sheet work. Klaviyo: sign-up from the app at 14:00, double opt-in confirmed 15:06, welcome code `DH10-…` assigned 15:07 and received by email. Sentry isn't in this build (#98, #104)       |

### Production and the free plan (2026-10-26 to 27)

| Check                                | Result                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production front page, before        | `/` → 307 → `/collections/automated-collection` → **404**: the seeded demo collection no longer exists                                                                                                |
| Production front page, after (#164)  | `/` → 307 → `/collections/best-sellers` → 200, checked on the live site after the deploy                                                                                                              |
| Vercel CDN requests                  | 75% of the free plan's 1,000,000 a month by 26 Oct. About 270 deployments from 17 to 26 Oct (49 on the 26th), each followed by e2e and Lighthouse runs                                                |
| Ignored Build Step (dashboard, #165) | An empty test commit: "Canceled by Ignored Build Step", no deployment, reported to GitHub as success. Local check: docs-only and app-only commits skip, web changes and production build              |
| After                                | Ben, the next day: usage "reduced considerably" (the free plan shows only the last 12 hours)                                                                                                          |
| Functions in London (#81), measured  | Storefront API from London: 155 to 315 ms to first byte, `server-timing` 8 ms of processing, served through Shopify's London edge to its US origin. Closed unmerged: London functions would be slower |

### Bug sweep (2026-10-25)

Each surface at 390 px and 1280 px: status, console errors, failed requests
and sideways scrolling, then the screenshots read by eye.

| Surface                       | Pages | Result                                                                                                                                                                |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (batch, production build) | 10    | No errors or overflow. Visible bugs are all fixed by open PRs: "Formulate" in titles, header and footer (#96), descriptions run together (#68), raw plan names (#141) |
| Theme (live store)            | 11    | No errors or overflow. **New:** the cart button wrapped under the wordmark on phones; fixed in #156, checked at 320–1280 px                                           |
| App (web build of the batch)  | 8     | No errors. Same "Formulate" and description items as web                                                                                                              |

Also from the same day: an SEO audit of the web build (#154: policy titles,
home canonical, a default share image, Organization and WebSite data), and the
Functions stack brought up to date with the batch.

| Suite                       | Tests                | At                                  |
| --------------------------- | -------------------- | ----------------------------------- |
| `apps/mobile` (Jest)        | 36                   | `tben140/app-tests-more` (#155)     |
| `cart-limits` Function      | 6                    | `tben140/checkout-guarantee` (#149) |
| `stack-discount` Function   | 7                    | `tben140/checkout-guarantee` (#149) |
| Checkout extensions         | 14                   | `tben140/checkout-guarantee` (#149) |
| Web e2e, with #94's reviews | 36 passed, 6 skipped | `tben140/reviews-judgeme` (#94)     |

## Review

From 19 October every PR, drafts included, was reviewed by CodeRabbit as well
as by Ben. From #56 to #140 it left **76 inline findings across 24 PRs**,
counted from GitHub's review comments (replies excluded). Each was fixed or
answered before merging. Examples that mattered:

- a Sentry field that would have carried Shopify's authorisation code (#97);
- a back-in-stock form that put the shopper's email in the URL without
  JavaScript (#72);
- a rate limit that every web customer shared, because web calls the Worker
  from one server (#136);
- prepaid subscriptions that a frequency change would have turned into
  charge-every-delivery (#136).
- a saving claim and renewal terms that would have been untrue for a plan
  with an introductory price (#141);
- a cart that showed "90-day supply" on a line holding two deliveries, with
  no way to correct it (#143);
- Shop Pay checkouts from the cart that skipped the analytics event every
  other checkout records (#144).

## CI that catches things

- **A gate catching a real regression.** A fix for one feature (#38) made
  the cart drawer's heading its first focus. Web e2e failed on it:
  `keyboard-only: collection to cart, with focus moved into the drawer`,
  [run 37337223221](https://github.com/tben140/formulate/actions/runs/37337223221).
  It was fixed on #38 and merged into #56.
- **The codegen drift check.** CI regenerates the Storefront types and runs
  `git diff --exit-code` on them. Checked 2026-10-05 with a hand edit committed
  to `generated/graphql.ts` on a throwaway local commit: the check exited 1,
  which fails the run.
- **A green pipeline.** [CI run 37340988985](https://github.com/tben140/formulate/actions/runs/37340988985)
  on the integration branch at `e022a1b`: 21/21 tasks in 49 s.
- **A Lighthouse budget blocking a merge: none yet.** SHO-29 (deliberately slow
  a page and watch all three gates turn red) would provide one.

⚠️ **A skipped job shows as passed.** `E2E (mobile)` skips until the
`SHOPIFY_STOREFRONT_TOKEN` secret exists, and GitHub records that as success
([run 37340514272](https://github.com/tben140/formulate/actions/runs/37340514272)).
Don't count its green as evidence until the secret is set.

## Parallel development

- 30 open PRs on 2026-10-05, 17 of them draft PRs from this round, worked in
  24 git worktrees, several stacked as chains.
- Turborepo's cache: **0 of 21 tasks cached in CI**, since remote caching is
  off. Locally it skips unchanged packages, but there's no CI saving to claim.
- The concurrency ceiling (SHO-67) hasn't been measured.
