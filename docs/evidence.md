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
performance need a device or simulator: Flashlight on Android, Maestro on iOS
(SHO-25, SHO-26), Sentry vitals (SHO-27). They wait on EAS builds (SHO-24).

## Accessibility

| Surface | Check                                                      | Result                                                                                  |
| ------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Web     | axe, WCAG 2.2 AA, on every Vercel deployment (`E2E (web)`) | Pass                                                                                    |
| Theme   | axe, WCAG 2.2 AA, on a temporary theme per PR (#59)        | 16/16, [run 37212316127](https://github.com/tben140/formulate/actions/runs/37212316127) |
| App     | axe through its web build (#69)                            | Clean on every main screen and sheet                                                    |

Device-only checks (VoiceOver order, gestures, Dynamic Type) are still manual.

## Tests

Unit coverage at `e022a1b`, from `pnpm --filter <package> test:coverage`.
Generated code, codegen config and barrel `index.ts` files are excluded.

| Package                 | Tests | Lines | Branches | Functions |
| ----------------------- | ----- | ----- | -------- | --------- |
| `packages/shopify`      | 92    | 70.2% | 88.2%    | 85.7%     |
| `packages/analytics`    | 50    | 97.4% | 88.5%    | 94.1%     |
| `apps/api` (the Worker) | 20    | 94.0% | 100%     | 75.0%     |

**Gaps:**

- **`packages/shopify/src/client.ts` has no unit tests** (0%). It's exercised by
  the smoke test and every end-to-end suite, but not in isolation.
- **There's no enforced coverage threshold.** The "elevated shared-package bar"
  SHO-43 describes doesn't exist yet; these are measurements, not a gate.

End to end, all open PRs combined (2026-10-05, posted on #56):

| Suite                               | Result                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Web (Playwright, desktop and phone) | 75 passed, 5 skipped (desktop-only keyboard tests in the phone project) |
| App (Playwright on Expo web)        | 10 passed                                                               |
| Theme (axe)                         | 16 passed                                                               |
| `turbo lint typecheck test build`   | 21/21                                                                   |

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
